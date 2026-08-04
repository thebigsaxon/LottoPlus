#!/bin/bash
set -e

echo "🔨 Building LottoPlus Native macOS Application..."

swift build -c release

APP_NAME="LottoPlus.app"
BUILD_DIR=".build/release"
OUTPUT_DIR="dist"

mkdir -p "$OUTPUT_DIR/$APP_NAME/Contents/MacOS"
mkdir -p "$OUTPUT_DIR/$APP_NAME/Contents/Resources"

cp "$BUILD_DIR/LottoPlus" "$OUTPUT_DIR/$APP_NAME/Contents/MacOS/LottoPlus"
cp index.html "$OUTPUT_DIR/$APP_NAME/Contents/Resources/index.html"

cat << EOF > "$OUTPUT_DIR/$APP_NAME/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>LottoPlus</string>
    <key>CFBundleIdentifier</key>
    <string>com.lottoplus.mac</string>
    <key>CFBundleName</key>
    <string>LottoPlus</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

echo "✨ Successfully generated $OUTPUT_DIR/$APP_NAME !"
