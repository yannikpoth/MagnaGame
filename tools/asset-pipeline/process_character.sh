#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_common.sh"

usage() {
  cat <<'USAGE'
Usage:
  tools/asset-pipeline/process_character.sh <characterId>

What it does:
  - Extract + preprocess (remove white, trim) all animations for the character
  - Compute the global max bounding box across all frames for that character
  - Round + pad to a stable frame size
  - Center/extent every frame to the final size
  - Build horizontal sprite-sheet PNG strips per animation
  - Emit public/assets/processed/spritesheets/<characterId>/frames.json
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

character_id="${1:-}"
if [[ -z "$character_id" ]]; then
  usage
  exit 1
fi

require_cmd ffmpeg
require_cmd magick
require_cmd python3

root="$(repo_root)"
cfg="$(config_path)"

character_json="$(python3 - "$cfg" "$character_id" <<'PY'
import json, sys
cfg_path, character_id = sys.argv[1], sys.argv[2]
cfg = json.load(open(cfg_path, "r", encoding="utf-8"))
char = next((c for c in cfg.get("characters", []) if c.get("characterId") == character_id), None)
if not char:
    sys.exit(2)
print(json.dumps(char))
PY
)" || {
  echo "Unknown characterId '$character_id' in config: $cfg" >&2
  exit 1
}

rounding_multiple="$(json_get "$cfg" 'cfg["defaults"]["rounding"]["multiple"]')"
extra_pad="$(json_get "$cfg" 'cfg["defaults"]["pad"]["extraPaddingPx"]')"

work_char_dir="$(work_frames_dir)/$character_id"
out_char_dir="$(out_sheets_dir)/$character_id"
mkdir -p "$work_char_dir" "$out_char_dir"

echo "== Processing character: $character_id =="
echo "Work frames: $work_char_dir"
echo "Output:      $out_char_dir"

anim_names="$(python3 - "$character_json" <<'PY'
import json, sys
char = json.loads(sys.argv[1])
for a in char.get("animations", []):
    print(a["name"])
PY
)"

if [[ -z "$anim_names" ]]; then
  echo "No animations listed for '$character_id'." >&2
  exit 1
fi

# 1-3) Extract + remove white + trim per animation
while IFS= read -r anim; do
  bash "$SCRIPT_DIR/process_one_animation.sh" "$character_id" "$anim"
done <<< "$anim_names"

# 4) Compute global max width/height across all frames for the character
echo "Computing global max bounds across: $work_char_dir/*/frame_*.png"
max_wh="$(magick identify -format "%w %h\n" "$work_char_dir"/*/frame_*.png | awk '
{ if ($1 > maxw) maxw = $1; if ($2 > maxh) maxh = $2; }
END { printf("%d %d\n", maxw, maxh); }
')"

max_w="$(awk '{print $1}' <<<"$max_wh")"
max_h="$(awk '{print $2}' <<<"$max_wh")"
if [[ -z "$max_w" || -z "$max_h" || "$max_w" -le 0 || "$max_h" -le 0 ]]; then
  echo "Failed to compute max bounds for '$character_id'." >&2
  exit 1
fi

rounded_w="$(round_up_multiple "$max_w" "$rounding_multiple")"
rounded_h="$(round_up_multiple "$max_h" "$rounding_multiple")"
final_w=$(( rounded_w + 2 * extra_pad ))
final_h=$(( rounded_h + 2 * extra_pad ))

echo "Max bounds:     ${max_w}x${max_h}"
echo "Rounded bounds: ${rounded_w}x${rounded_h} (multiple=${rounding_multiple})"
echo "Final frame:    ${final_w}x${final_h} (extraPaddingPx=${extra_pad})"

# 5) Normalize every frame to final size, centered
echo "Normalizing frames (center + extent ${final_w}x${final_h})"
magick mogrify -background none -gravity center -extent "${final_w}x${final_h}" "$work_char_dir"/*/frame_*.png

# 6) Build sprite sheets per animation
echo "Building sprite sheets"
while IFS= read -r anim; do
  in_dir="$work_char_dir/$anim"
  out_png="$out_char_dir/$anim.png"
  rm -f "$out_png"
  magick montage "$in_dir"/frame_*.png -tile x1 -geometry "${final_w}x${final_h}+0+0" -background none "$out_png"
done <<< "$anim_names"

# 7) Emit frames.json manifest
manifest_path="$out_char_dir/frames.json"
python3 - "$cfg" "$character_id" "$final_w" "$final_h" "$manifest_path" "$out_char_dir" <<'PY'
import json, os, sys

cfg_path, character_id = sys.argv[1], sys.argv[2]
frame_w, frame_h = int(sys.argv[3]), int(sys.argv[4])
manifest_path, out_char_dir = sys.argv[5], sys.argv[6]

cfg = json.load(open(cfg_path, "r", encoding="utf-8"))
char = next((c for c in cfg.get("characters", []) if c.get("characterId") == character_id), None)
if not char:
    raise SystemExit(2)

animations = {}
for anim in char.get("animations", []):
    name = anim["name"]
    sheet_file = f"{name}.png"
    sheet_abs = os.path.join(out_char_dir, sheet_file)
    if not os.path.exists(sheet_abs):
        raise SystemExit(f"Missing expected sprite sheet: {sheet_abs}")

    # Frame count equals number of extracted frames in work dir (already normalized).
    work_dir = os.path.join(os.path.dirname(out_char_dir), "..", "..", "work", "frames", character_id, name)
    work_dir = os.path.abspath(work_dir)
    frame_files = [f for f in os.listdir(work_dir) if f.startswith("frame_") and f.endswith(".png")]
    frame_files.sort()
    frame_count = len(frame_files)

    animations[name] = {
        # Relative to the processed asset root (e.g. public/assets/processed/…).
        "file": os.path.relpath(sheet_abs, start=os.path.dirname(os.path.dirname(out_char_dir))),
        "fps": int(anim.get("fps") or cfg["defaults"]["ffmpeg"]["fps"]),
        "frameCount": frame_count
    }

manifest = {
    "characterId": character_id,
    "frameWidth": frame_w,
    "frameHeight": frame_h,
    "animations": animations
}

os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
PY

echo "Wrote manifest: $manifest_path"
echo "Done: $character_id"


