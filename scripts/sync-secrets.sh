#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT_DIR/.env.1password"
TARGET="$ROOT_DIR/.env"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "[sync-secrets] $TEMPLATE not found, skipping."
  exit 0
fi

if ! command -v op >/dev/null 2>&1; then
  echo "[sync-secrets] 1Password CLI (op) not found, skipping."
  exit 0
fi

if op inject --in-file "$TEMPLATE" --out-file "$TARGET"; then
  echo "[sync-secrets] Wrote $TARGET from $TEMPLATE"
else
  echo "[sync-secrets] Failed to inject secrets from $TEMPLATE"
  exit 1
fi
