#!/bin/bash
set -e

echo "Building Cash 5 Studio for macOS..."

swift build -c release

APP_NAME="Cash 5 Studio.app"
BUILD_DIR=".build/release"
OUTPUT_DIR="dist"

mkdir -p "$OUTPUT_DIR/$APP_NAME/Contents/MacOS"
mkdir -p "$OUTPUT_DIR/$APP_NAME/Contents/Resources"

cp "$BUILD_DIR/Cash5Studio" "$OUTPUT_DIR/$APP_NAME/Contents/MacOS/Cash5Studio"
cp index.html "$OUTPUT_DIR/$APP_NAME/Contents/Resources/index.html"
cp -R css "$OUTPUT_DIR/$APP_NAME/Contents/Resources/"
cp -R js "$OUTPUT_DIR/$APP_NAME/Contents/Resources/"

if [ -f "assets/AppIcon.icns" ]; then
    cp assets/AppIcon.icns "$OUTPUT_DIR/$APP_NAME/Contents/Resources/AppIcon.icns"
fi

cat << EOF > "$OUTPUT_DIR/$APP_NAME/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>Cash5Studio</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.cash5studio.mac</string>
    <key>CFBundleName</key>
    <string>Cash 5 Studio</string>
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

# Touch app bundle to force macOS Finder & Dock icon cache update
touch "$OUTPUT_DIR/$APP_NAME"

echo "Packaged $OUTPUT_DIR/$APP_NAME"
