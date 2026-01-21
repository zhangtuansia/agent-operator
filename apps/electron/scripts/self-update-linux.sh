#!/bin/bash
# Linux AppImage self-update script
# This script is executed to apply updates on Linux

set -e

NEW_APPIMAGE="$1"
CURRENT_APPIMAGE="$2"

if [ -z "$NEW_APPIMAGE" ] || [ -z "$CURRENT_APPIMAGE" ]; then
    echo "Usage: self-update-linux.sh <new-appimage> <current-appimage>"
    exit 1
fi

# Make the new AppImage executable
chmod +x "$NEW_APPIMAGE"

# Replace the current AppImage
mv "$NEW_APPIMAGE" "$CURRENT_APPIMAGE"

# Relaunch
exec "$CURRENT_APPIMAGE"
