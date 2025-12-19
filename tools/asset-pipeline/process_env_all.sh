#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_common.sh"

usage() {
  cat <<'USAGE'
Usage:
  tools/asset-pipeline/process_env_all.sh

Runs:
  - process_env_parallax.sh
  - process_env_platform.sh
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

bash "$SCRIPT_DIR/process_env_parallax.sh"
bash "$SCRIPT_DIR/process_env_platform.sh"


