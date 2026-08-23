#!/bin/bash
set -e

mkdir -p assets/AppIcon.iconset

sips -z 16 16     assets/AppIcon1024.png --out assets/AppIcon.iconset/icon_16x16.png
sips -z 32 32     assets/AppIcon1024.png --out assets/AppIcon.iconset/icon_16x16@2x.png
sips -z 32 32     assets/AppIcon1024.png --out assets/AppIcon.iconset/icon_32x32.png
sips -z 64 64     assets/AppIcon1024.png --out assets/AppIcon.iconset/icon_32x32@2x.png
sips -z 128 128   assets/AppIcon1024.png --out assets/AppIcon.iconset/icon_128x128.png
sips -z 256 256   assets/AppIcon1024.png --out assets/AppIcon.iconset/icon_128x128@2x.png
sips -z 256 256   assets/AppIcon1024.png --out assets/AppIcon.iconset/icon_256x256.png
sips -z 512 512   assets/AppIcon1024.png --out assets/AppIcon.iconset/icon_256x256@2x.png
sips -z 512 512   assets/AppIcon1024.png --out assets/AppIcon.iconset/icon_512x512.png
sips -z 1024 1024 assets/AppIcon1024.png --out assets/AppIcon.iconset/icon_512x512@2x.png

if ! iconutil -c icns assets/AppIcon.iconset -o assets/AppIcon.icns; then
    python3 -c 'from PIL import Image; Image.open("assets/AppIcon1024.png").convert("RGBA").save("assets/AppIcon.icns", format="ICNS")'
fi
rm -rf assets/AppIcon.iconset

echo "Created assets/AppIcon.icns"
