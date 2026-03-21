#!/bin/bash
# Build Star-Office-UI backend into standalone executable via PyInstaller
set -e

OFFICE_DIR="$(cd "$(dirname "$0")/../apps/electron/src/office-backend" && pwd)"

echo "Building Star Office server..."
echo "Source: $OFFICE_DIR"

python3 -m PyInstaller --onefile --name star-office-server \
  --add-data "$OFFICE_DIR/frontend:frontend" \
  --add-data "$OFFICE_DIR/assets:assets" \
  --add-data "$OFFICE_DIR/backend/memo_utils.py:." \
  --add-data "$OFFICE_DIR/backend/security_utils.py:." \
  --add-data "$OFFICE_DIR/backend/store_utils.py:." \
  --hidden-import flask --hidden-import PIL \
  --distpath "$OFFICE_DIR/dist" \
  --workpath /tmp/pyinstaller-office-build \
  --specpath /tmp/pyinstaller-office-build \
  "$OFFICE_DIR/backend/app.py"

echo ""
echo "Build complete: $OFFICE_DIR/dist/star-office-server"
ls -lh "$OFFICE_DIR/dist/star-office-server"
