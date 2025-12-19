#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_common.sh"

usage() {
  cat <<'USAGE'
Usage:
  tools/asset-pipeline/process_all.sh

Processes every character listed in tools/asset-pipeline/assets.config.json
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd python3

cfg="$(config_path)"

character_ids="$(python3 - "$cfg" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1], "r", encoding="utf-8"))
for c in cfg.get("characters", []):
    print(c["characterId"])
PY
)"

if [[ -z "$character_ids" ]]; then
  echo "No characters found in config: $cfg" >&2
  exit 1
fi

while IFS= read -r cid; do
  bash "$SCRIPT_DIR/process_character.sh" "$cid"
done <<< "$character_ids"


