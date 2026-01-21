#!/bin/bash
# macOS self-update script
# This script is executed to apply updates on macOS

set -e

DMG_PATH="$1"
APP_PATH="$2"

if [ -z "$DMG_PATH" ] || [ -z "$APP_PATH" ]; then
    echo "Usage: self-update.sh <dmg-path> <app-path>"
    exit 1
fi

# Mount the DMG
MOUNT_POINT=$(hdiutil attach "$DMG_PATH" -nobrowse | grep "/Volumes" | awk '{print $3}')

if [ -z "$MOUNT_POINT" ]; then
    echo "Failed to mount DMG"
    exit 1
fi

# Find the app in the mounted volume
NEW_APP=$(find "$MOUNT_POINT" -name "*.app" -maxdepth 1 | head -1)

if [ -z "$NEW_APP" ]; then
    hdiutil detach "$MOUNT_POINT"
    echo "No app found in DMG"
    exit 1
fi

# Remove old app and copy new one
rm -rf "$APP_PATH"
cp -R "$NEW_APP" "$APP_PATH"

# Unmount and cleanup
hdiutil detach "$MOUNT_POINT"
rm -f "$DMG_PATH"

# Relaunch the app
open "$APP_PATH"
