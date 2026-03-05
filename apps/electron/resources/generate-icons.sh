#!/bin/bash
# Generate app icons for all platforms from a source PNG.
# Output files are always written next to this script (resources directory).
# Usage: ./generate-icons.sh source.png

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_INPUT="${1:-source.png}"

if [[ "$SOURCE_INPUT" = /* ]]; then
    SOURCE="$SOURCE_INPUT"
else
    SOURCE="$SCRIPT_DIR/$SOURCE_INPUT"
fi

if [ ! -f "$SOURCE" ]; then
    echo "Error: Source file '$SOURCE' not found"
    echo "Usage: ./generate-icons.sh source.png"
    exit 1
fi

echo "Generating icons from: $SOURCE"

ICONSET="$SCRIPT_DIR/icon.iconset"
ICON_ICNS="$SCRIPT_DIR/icon.icns"
ICON_PNG="$SCRIPT_DIR/icon.png"
ICON_ICO="$SCRIPT_DIR/icon.ico"

# Create temporary iconset directory for macOS
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# Generate all sizes for macOS iconset
echo "Generating macOS iconset..."
sips -z 16 16 "$SOURCE" --out "$ICONSET/icon_16x16.png" > /dev/null
sips -z 32 32 "$SOURCE" --out "$ICONSET/icon_16x16@2x.png" > /dev/null
sips -z 32 32 "$SOURCE" --out "$ICONSET/icon_32x32.png" > /dev/null
sips -z 64 64 "$SOURCE" --out "$ICONSET/icon_32x32@2x.png" > /dev/null
sips -z 128 128 "$SOURCE" --out "$ICONSET/icon_128x128.png" > /dev/null
sips -z 256 256 "$SOURCE" --out "$ICONSET/icon_128x128@2x.png" > /dev/null
sips -z 256 256 "$SOURCE" --out "$ICONSET/icon_256x256.png" > /dev/null
sips -z 512 512 "$SOURCE" --out "$ICONSET/icon_256x256@2x.png" > /dev/null
sips -z 512 512 "$SOURCE" --out "$ICONSET/icon_512x512.png" > /dev/null
sips -z 1024 1024 "$SOURCE" --out "$ICONSET/icon_512x512@2x.png" > /dev/null

# Generate .icns for macOS
echo "Creating icon.icns..."
iconutil -c icns "$ICONSET" -o "$ICON_ICNS"

# Generate icon.png for Linux (512x512)
echo "Creating icon.png for Linux..."
sips -z 512 512 "$SOURCE" --out "$ICON_PNG" > /dev/null

# Generate icon.ico for Windows using ImageMagick (if available)
# If not, we'll create individual PNGs that can be converted online
if command -v convert &> /dev/null; then
    echo "Creating icon.ico for Windows..."
    # Create multiple sizes for ICO
    sips -z 16 16 "$SOURCE" --out "$SCRIPT_DIR/icon_16.png" > /dev/null
    sips -z 24 24 "$SOURCE" --out "$SCRIPT_DIR/icon_24.png" > /dev/null
    sips -z 32 32 "$SOURCE" --out "$SCRIPT_DIR/icon_32.png" > /dev/null
    sips -z 48 48 "$SOURCE" --out "$SCRIPT_DIR/icon_48.png" > /dev/null
    sips -z 64 64 "$SOURCE" --out "$SCRIPT_DIR/icon_64.png" > /dev/null
    sips -z 128 128 "$SOURCE" --out "$SCRIPT_DIR/icon_128.png" > /dev/null
    sips -z 256 256 "$SOURCE" --out "$SCRIPT_DIR/icon_256.png" > /dev/null

    convert \
      "$SCRIPT_DIR/icon_16.png" \
      "$SCRIPT_DIR/icon_24.png" \
      "$SCRIPT_DIR/icon_32.png" \
      "$SCRIPT_DIR/icon_48.png" \
      "$SCRIPT_DIR/icon_64.png" \
      "$SCRIPT_DIR/icon_128.png" \
      "$SCRIPT_DIR/icon_256.png" \
      "$ICON_ICO"

    # Clean up temp files
    rm -f \
      "$SCRIPT_DIR/icon_16.png" \
      "$SCRIPT_DIR/icon_24.png" \
      "$SCRIPT_DIR/icon_32.png" \
      "$SCRIPT_DIR/icon_48.png" \
      "$SCRIPT_DIR/icon_64.png" \
      "$SCRIPT_DIR/icon_128.png" \
      "$SCRIPT_DIR/icon_256.png"
else
    echo "Warning: ImageMagick not installed. Skipping .ico generation."
    echo "Install with: brew install imagemagick"
    echo "Or use an online converter with the 256x256 PNG."
fi

# Clean up iconset directory
rm -rf "$ICONSET"

echo ""
echo "✅ Icons generated:"
ls -la "$SCRIPT_DIR"/icon.*

echo ""
echo "Next steps:"
echo "1. Update apps/electron/src/main/index.ts to use icon.icns on macOS"
echo "2. Run: bun run electron:build:resources"
