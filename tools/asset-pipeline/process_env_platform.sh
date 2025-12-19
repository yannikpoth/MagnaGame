#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_common.sh"

usage() {
  cat <<'USAGE'
Usage:
  tools/asset-pipeline/process_env_platform.sh

Processes:
  - assets/raw/platform/*.png

Outputs:
  - public/assets/processed/environment/platform/*.png
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd magick
require_cmd python3

root="$(repo_root)"
cfg="$(env_config_path)"
out_dir="$(out_env_dir)/platform"
mkdir -p "$out_dir"

if [[ ! -f "$cfg" ]]; then
  echo "Missing env config: $cfg" >&2
  exit 1
fi

read_setting() {
  # Usage: read_setting <section> <file_rel_or_empty> <python_expr>
  local section="$1"
  local file_rel="${2:-}"
  local expr="$3"
  python3 - "$cfg" "$section" "$file_rel" "$expr" <<'PY'
import json, sys
cfg_path, section, file_rel, expr = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
cfg = json.load(open(cfg_path, "r", encoding="utf-8"))

def deep_get(d, path):
    cur = d
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur

def merged_settings():
    out = {}
    out.update(cfg.get("defaults", {}))
    out.update(cfg.get(section, {}))
    if file_rel and isinstance(cfg.get("files", {}), dict) and file_rel in cfg["files"]:
        out.update(cfg["files"][file_rel])
    return out

settings = merged_settings()
val = eval(expr, {"cfg": cfg, "settings": settings, "deep_get": deep_get})
if isinstance(val, (dict, list)):
    import json as _json
    print(_json.dumps(val))
else:
    print(val)
PY
}

process_png() {
  local in_abs="$1"
  local out_abs="$2"
  local in_rel="$3"

  local remove_enabled fuzz halo_fix trim_enabled padding_px
  remove_enabled="$(read_setting "platform" "$in_rel" 'deep_get(settings, ["removeWhite","enabled"])')"
  fuzz="$(read_setting "platform" "$in_rel" 'deep_get(settings, ["removeWhite","fuzzPercent"]) or deep_get(cfg, ["defaults","removeWhite","fuzzPercent"])')"
  halo_fix="$(read_setting "platform" "$in_rel" 'deep_get(settings, ["removeWhite","haloFix"])')"
  edge_bleed_px="$(read_setting "platform" "$in_rel" 'deep_get(settings, ["removeWhite","edgeBleedPx"]) or 0')"
  trim_enabled="$(read_setting "platform" "$in_rel" 'deep_get(settings, ["trim","enabled"])')"
  padding_px="$(read_setting "platform" "$in_rel" 'settings.get("paddingPx", deep_get(cfg, ["defaults","paddingPx"]))')"

  mkdir -p "$(dirname "$out_abs")"

  if [[ "$remove_enabled" == "True" || "$remove_enabled" == "true" || "$remove_enabled" == "1" ]]; then
    magick "$in_abs" -alpha set -fuzz "${fuzz}%" -transparent white "$out_abs"
  else
    magick "$in_abs" -alpha set "$out_abs"
  fi

  # Optional edge-color bleed to prevent white halo shimmer on scaled rendering.
  if [[ "$remove_enabled" == "True" || "$remove_enabled" == "true" || "$remove_enabled" == "1" ]]; then
    if [[ "${edge_bleed_px}" =~ ^[0-9]+$ ]] && [[ "${edge_bleed_px}" -gt 0 ]]; then
      alpha_bleed_png_inplace "$out_abs" "$edge_bleed_px"
    fi
  fi

  if [[ "$halo_fix" == "True" || "$halo_fix" == "true" || "$halo_fix" == "1" ]]; then
    magick "$out_abs" -alpha set -background none -flatten "$out_abs"
  fi

  if [[ "$trim_enabled" == "True" || "$trim_enabled" == "true" || "$trim_enabled" == "1" ]]; then
    magick "$out_abs" -trim +repage "$out_abs"
  fi

  if [[ "${padding_px}" =~ ^[0-9]+$ ]] && [[ "$padding_px" -gt 0 ]]; then
    local w h
    w="$(magick identify -format "%w" "$out_abs")"
    h="$(magick identify -format "%h" "$out_abs")"
    magick "$out_abs" -background none -gravity center -extent "$((w + 2 * padding_px))x$((h + 2 * padding_px))" "$out_abs"
  fi

  magick "$out_abs" -strip "$out_abs"
}

platform_dir_rel="$(read_setting "platform" "" 'cfg["inputs"]["platformDir"]')"
platform_dir_abs="$root/$platform_dir_rel"
if [[ ! -d "$platform_dir_abs" ]]; then
  echo "Missing platform dir: $platform_dir_rel (expected $platform_dir_abs)" >&2
  exit 1
fi

manifest_enabled="$(read_setting "platform" "" 'deep_get(cfg, ["defaults","manifest","enabled"])')"
count=0
while IFS= read -r -d '' in_file; do
  rel="assets/raw/platform/$(basename "$in_file")"
  out_file="$out_dir/$(basename "$in_file")"
  process_png "$in_file" "$out_file" "$rel"
  count=$((count + 1))
done < <(find "$platform_dir_abs" -maxdepth 1 -type f \( -iname "*.png" \) -print0)

echo "Processed platforms: $count"

if [[ "$manifest_enabled" == "True" || "$manifest_enabled" == "true" || "$manifest_enabled" == "1" ]]; then
  python3 - "$out_dir" "$(out_env_dir)/platform/manifest.json" <<'PY'
import json, os, sys, subprocess
out_dir, manifest_path = sys.argv[1], sys.argv[2]
items = []
for name in sorted(os.listdir(out_dir)):
    if not name.lower().endswith(".png"):
        continue
    p = os.path.join(out_dir, name)
    w = int(subprocess.check_output(["magick","identify","-format","%w",p]).decode().strip())
    h = int(subprocess.check_output(["magick","identify","-format","%h",p]).decode().strip())
    items.append({"file": name, "width": w, "height": h})
os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump(items, f, indent=2)
    f.write("\n")
PY
  echo "Wrote manifest: $(out_env_dir)/platform/manifest.json"
fi

echo "Done: platform"


