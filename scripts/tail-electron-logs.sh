#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${COWORK_APP_NAME:-${OPERATOR_APP_NAME:-Cowork}}"

declare -a CANDIDATES=(
  "$HOME/Library/Logs/$APP_NAME/main.log"
  "$HOME/Library/Logs/Cowork/main.log"
)

LOG_FILE=""
for candidate in "${CANDIDATES[@]}"; do
  if [[ -f "$candidate" ]]; then
    LOG_FILE="$candidate"
    break
  fi
done

if [[ -z "$LOG_FILE" ]]; then
  FOUND="$(find "$HOME/Library/Logs" -maxdepth 3 -type f -name 'main.log' 2>/dev/null | grep -E 'Cowork|agent-operator|Agent-Operator|agentoperator' | head -n 1 || true)"
  if [[ -n "$FOUND" ]]; then
    LOG_FILE="$FOUND"
  fi
fi

if [[ -z "$LOG_FILE" ]]; then
  echo "[tail-electron-logs] No Electron main log file found under ~/Library/Logs"
  exit 1
fi

echo "[tail-electron-logs] Tailing $LOG_FILE"
exec tail -n 200 -f "$LOG_FILE"
