#!/usr/bin/env bash
set -euo pipefail

repo_root() {
  # Find git root if available, otherwise assume script is under tools/asset-pipeline/
  if command -v git >/dev/null 2>&1 && git rev-parse --show-toplevel >/dev/null 2>&1; then
    git rev-parse --show-toplevel
  else
    cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
  fi
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

config_path() {
  local root
  root="$(repo_root)"
  echo "$root/tools/asset-pipeline/assets.config.json"
}

env_config_path() {
  local root
  root="$(repo_root)"
  echo "$root/tools/asset-pipeline/env.config.json"
}

work_frames_dir() {
  local root
  root="$(repo_root)"
  echo "$root/assets/work/frames"
}

out_sheets_dir() {
  local root
  root="$(repo_root)"
  # Runtime assets are served directly from repo root in this project.
  # (Keeps `/assets/processed/...` working for simple static servers like `python -m http.server`.)
  echo "$root/assets/processed/spritesheets"
}

out_env_dir() {
  local root
  root="$(repo_root)"
  # Runtime assets are served directly from repo root in this project.
  # (Keeps `/assets/processed/...` working for simple static servers like `python -m http.server`.)
  echo "$root/assets/processed/environment"
}

json_get() {
  # Usage: json_get <json_file> <python_expr_returning_string_or_number>
  # Example: json_get cfg.json 'cfg["defaults"]["ffmpeg"]["fps"]'
  local json_file="$1"
  local py_expr="$2"
  python3 - "$json_file" "$py_expr" <<'PY'
import json, sys
path = sys.argv[1]
expr = sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    cfg = json.load(f)
val = eval(expr, {"cfg": cfg})
if isinstance(val, (dict, list)):
    print(json.dumps(val))
else:
    print(val)
PY
}

round_up_multiple() {
  # Usage: round_up_multiple <value> <multiple>
  local value="$1"
  local multiple="$2"
  if [[ "$multiple" -le 0 ]]; then
    echo "$value"
    return
  fi
  echo $(( (value + multiple - 1) / multiple * multiple ))
}

alpha_bleed_png_inplace() {
  # Fills RGB of fully/mostly transparent pixels using nearby edge colors (prevents white halos).
  # Keeps the original alpha channel unchanged.
  #
  # Usage: alpha_bleed_png_inplace <file.png> [bleed_px]
  # Notes:
  # - This is meant to run AFTER background removal (e.g. -transparent white).
  # - bleed_px=2 is a good default for sprites/props.
  local in_abs="$1"
  local bleed_px="${2:-2}"
  magick "$in_abs" \
    \( +clone -alpha extract -write mpr:alpha +delete \) \
    -background black -alpha remove -alpha off \
    -morphology Dilate "Square:${bleed_px}" \
    mpr:alpha -compose CopyOpacity -composite \
    "$in_abs"
}


