#!/bin/bash
# Linux AppImage self-update script
# This script is executed to apply updates on Linux
#
# Arguments:
#   $1 - New AppImage path (the downloaded update)
#   $2 - Current AppImage path (the running app)

set -e

NEW_APPIMAGE="$1"
CURRENT_APPIMAGE="$2"

LOG_FILE="/tmp/cowork-update.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[$(date)] Starting Linux update..."
echo "[$(date)] New: $NEW_APPIMAGE"
echo "[$(date)] Current: $CURRENT_APPIMAGE"

if [ -z "$NEW_APPIMAGE" ] || [ -z "$CURRENT_APPIMAGE" ]; then
    echo "[$(date)] Error: Usage: self-update-linux.sh <new-appimage> <current-appimage>"
    exit 1
fi

if [ ! -f "$NEW_APPIMAGE" ]; then
    echo "[$(date)] Error: New AppImage not found: $NEW_APPIMAGE"
    exit 1
fi

# Wait for the app to fully quit
echo "[$(date)] Waiting for app to quit..."
sleep 2

# Additional wait: check if the app process is still running
APP_NAME=$(basename "$CURRENT_APPIMAGE" .AppImage)
for i in {1..10}; do
    if ! pgrep -f "$CURRENT_APPIMAGE" > /dev/null 2>&1; then
        echo "[$(date)] App has quit"
        break
    fi
    echo "[$(date)] Waiting for app to quit (attempt $i/10)..."
    sleep 1
done

# Create backup of current AppImage
BACKUP_PATH="${CURRENT_APPIMAGE}.backup"
if [ -f "$CURRENT_APPIMAGE" ]; then
    echo "[$(date)] Creating backup: $BACKUP_PATH"
    cp "$CURRENT_APPIMAGE" "$BACKUP_PATH"
fi

# Make the new AppImage executable
echo "[$(date)] Making new AppImage executable..."
chmod +x "$NEW_APPIMAGE"

# Replace the current AppImage
echo "[$(date)] Replacing AppImage..."
if mv "$NEW_APPIMAGE" "$CURRENT_APPIMAGE"; then
    echo "[$(date)] Replacement successful"
    rm -f "$BACKUP_PATH" 2>/dev/null || true
else
    echo "[$(date)] Replacement failed, restoring backup"
    if [ -f "$BACKUP_PATH" ]; then
        mv "$BACKUP_PATH" "$CURRENT_APPIMAGE"
    fi
    exit 1
fi

# Relaunch
echo "[$(date)] Relaunching app..."
sleep 1
exec "$CURRENT_APPIMAGE" &

echo "[$(date)] Update complete!"
