#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_common.sh"

usage() {
  cat <<'USAGE'
Usage:
  tools/asset-pipeline/process_one_animation.sh <characterId> <animationName>

Notes:
  - This extracts frames + removes white + trims to content.
  - Final padding and sprite-sheet assembly happen in process_character.sh.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

character_id="${1:-}"
animation_name="${2:-}"
if [[ -z "$character_id" || -z "$animation_name" ]]; then
  usage
  exit 1
fi

require_cmd ffmpeg
require_cmd magick
require_cmd python3

root="$(repo_root)"
cfg="$(config_path)"

out_dir="$(work_frames_dir)/$character_id/$animation_name"
mkdir -p "$out_dir"

# Clear any previous run for determinism
rm -f "$out_dir"/frame_*.png

py='next((c for c in cfg["characters"] if c["characterId"] == character_id), None)'
char_exists="$(python3 - "$cfg" "$character_id" <<'PY'
import json, sys
cfg_path, character_id = sys.argv[1], sys.argv[2]
cfg = json.load(open(cfg_path, "r", encoding="utf-8"))
ok = any(c.get("characterId") == character_id for c in cfg.get("characters", []))
print("1" if ok else "0")
PY
)"
if [[ "$char_exists" != "1" ]]; then
  echo "Unknown characterId '$character_id' in config: $cfg" >&2
  exit 1
fi

anim_json="$(python3 - "$cfg" "$character_id" "$animation_name" <<'PY'
import json, sys
cfg_path, character_id, anim_name = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = json.load(open(cfg_path, "r", encoding="utf-8"))
char = next((c for c in cfg.get("characters", []) if c.get("characterId") == character_id), None)
if not char:
    sys.exit(2)
anim = next((a for a in char.get("animations", []) if a.get("name") == anim_name), None)
if not anim:
    sys.exit(3)
print(json.dumps(anim))
PY
)" || {
  echo "Animation '$animation_name' not found under '$character_id' in config." >&2
  exit 1
}

src_mp4="$(python3 - "$anim_json" <<'PY'
import json, sys
anim = json.loads(sys.argv[1])
print(anim["srcMp4"])
PY
)"

max_seconds="$(python3 - "$anim_json" <<'PY'
import json, sys
anim = json.loads(sys.argv[1])
v = anim.get("maxSeconds", None)
if v is None:
    print("")
    raise SystemExit(0)
try:
    f = float(v)
except Exception:
    print("")
    raise SystemExit(0)
if f <= 0:
    print("")
    raise SystemExit(0)
print(f)
PY
)"

fps="$(python3 - "$cfg" "$anim_json" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1], "r", encoding="utf-8"))
anim = json.loads(sys.argv[2])
print(anim.get("fps") or cfg["defaults"]["ffmpeg"]["fps"])
PY
)"

fuzz="$(json_get "$cfg" 'cfg["defaults"]["removeWhite"]["fuzzPercent"]')"

src_abs="$root/$src_mp4"
if [[ ! -f "$src_abs" ]]; then
  echo "Missing source MP4: $src_mp4 (expected at $src_abs)" >&2
  exit 1
fi

echo "Extracting frames: $src_mp4 -> $out_dir (fps=$fps)"
if [[ -n "$max_seconds" ]]; then
  echo "Trimming input to maxSeconds=$max_seconds"
  ffmpeg -hide_banner -loglevel error -y -t "$max_seconds" -i "$src_abs" -vf "fps=$fps" "$out_dir/frame_%04d.png"
else
  ffmpeg -hide_banner -loglevel error -y -i "$src_abs" -vf "fps=$fps" "$out_dir/frame_%04d.png"
fi

echo "Removing white background (fuzz=${fuzz}%)"
magick mogrify -fuzz "${fuzz}%" -transparent white "$out_dir"/frame_*.png

echo "Fixing edge halos (alpha bleed)"
bleed_px=2
for f in "$out_dir"/frame_*.png; do
  alpha_bleed_png_inplace "$f" "$bleed_px"
done

echo "Trimming to content"
magick mogrify -trim +repage "$out_dir"/frame_*.png

count="$(ls -1 "$out_dir"/frame_*.png 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$count" -le 0 ]]; then
  echo "No frames produced for $character_id/$animation_name." >&2
  exit 1
fi
echo "OK: $count frames"


