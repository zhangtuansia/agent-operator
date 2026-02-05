#!/bin/bash
# macOS self-update script
# This script is executed to apply updates on macOS
#
# Arguments:
#   $1 - DMG path (the downloaded update)
#   $2 - App bundle path (e.g., /Applications/Cowork.app)

set -e

DMG_PATH="$1"
APP_PATH="$2"

LOG_FILE="/tmp/cowork-update.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[$(date)] Starting update..."
echo "[$(date)] DMG: $DMG_PATH"
echo "[$(date)] App: $APP_PATH"

if [ -z "$DMG_PATH" ] || [ -z "$APP_PATH" ]; then
    echo "[$(date)] Error: Usage: self-update.sh <dmg-path> <app-path>"
    exit 1
fi

if [ ! -f "$DMG_PATH" ]; then
    echo "[$(date)] Error: DMG file not found: $DMG_PATH"
    exit 1
fi

# Wait for the app to fully quit (give it some time to release file handles)
echo "[$(date)] Waiting for app to quit..."
sleep 2

# Additional wait: check if the app process is still running
APP_NAME=$(basename "$APP_PATH" .app)
for i in {1..10}; do
    if ! pgrep -x "$APP_NAME" > /dev/null 2>&1; then
        echo "[$(date)] App has quit"
        break
    fi
    echo "[$(date)] Waiting for $APP_NAME to quit (attempt $i/10)..."
    sleep 1
done

# Mount the DMG
echo "[$(date)] Mounting DMG..."
MOUNT_OUTPUT=$(hdiutil attach "$DMG_PATH" -nobrowse 2>&1)
ATTACH_LINE=$(echo "$MOUNT_OUTPUT" | grep "/Volumes/" | tail -1)
MOUNT_DEVICE=$(echo "$ATTACH_LINE" | awk '{print $1}')
# Keep everything after the first two columns (/dev/* and fs type) to preserve spaces in volume names.
MOUNT_POINT=$(echo "$ATTACH_LINE" | sed -E 's/^[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+//' | sed -E 's/[[:space:]]+$//')

if [ -z "$MOUNT_POINT" ] || [ ! -d "$MOUNT_POINT" ]; then
    echo "[$(date)] Failed to mount DMG"
    echo "[$(date)] hdiutil output: $MOUNT_OUTPUT"
    exit 1
fi

echo "[$(date)] Mounted at: $MOUNT_POINT"

cleanup_mount() {
    if [ -n "$MOUNT_DEVICE" ]; then
        hdiutil detach "$MOUNT_DEVICE" 2>/dev/null || hdiutil detach "$MOUNT_POINT" 2>/dev/null || true
    elif [ -n "$MOUNT_POINT" ]; then
        hdiutil detach "$MOUNT_POINT" 2>/dev/null || true
    fi
}

trap cleanup_mount EXIT

# Find the app in the mounted volume
NEW_APP=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" | head -1)

if [ -z "$NEW_APP" ]; then
    echo "[$(date)] No app found in DMG"
    echo "[$(date)] Contents:"
    ls -la "$MOUNT_POINT" || true
    exit 1
fi

echo "[$(date)] Found new app: $NEW_APP"

# Get the destination directory
DEST_DIR=$(dirname "$APP_PATH")
APP_BASENAME=$(basename "$APP_PATH")

# Create backup of old app
BACKUP_PATH="${APP_PATH}.backup"
if [ -d "$APP_PATH" ]; then
    echo "[$(date)] Creating backup: $BACKUP_PATH"
    rm -rf "$BACKUP_PATH" 2>/dev/null || true
    mv "$APP_PATH" "$BACKUP_PATH"
fi

# Copy new app
echo "[$(date)] Installing new app to: $APP_PATH"
if ditto "$NEW_APP" "$APP_PATH"; then
    echo "[$(date)] Copy successful"
    # Remove backup on success
    rm -rf "$BACKUP_PATH" 2>/dev/null || true
else
    echo "[$(date)] Copy failed, restoring backup"
    if [ -d "$BACKUP_PATH" ]; then
        mv "$BACKUP_PATH" "$APP_PATH"
    fi
    exit 1
fi

# Unmount DMG
echo "[$(date)] Unmounting DMG..."
cleanup_mount
trap - EXIT

# Cleanup downloaded DMG
echo "[$(date)] Cleaning up DMG..."
rm -f "$DMG_PATH" 2>/dev/null || true

# Relaunch the app
echo "[$(date)] Relaunching app..."
sleep 1
open "$APP_PATH"

echo "[$(date)] Update complete!"
