#!/bin/bash
set -euo pipefail
PMRZ_MAC_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
exec /bin/bash "$PMRZ_MAC_DIRECTORY/run-control.sh"
