#!/bin/bash
# Rebuild the Release app and reinstall it on the connected iPhone (run every 7 days).
set -e
cd "$(dirname "$0")/ios"
DEVICE=$(xcrun devicectl list devices 2>/dev/null | grep -i "iphone" | grep -oE "[0-9A-F]{8}-[0-9A-F]{16}" | head -1)
[ -z "$DEVICE" ] && { echo "No iPhone connected. Plug it in, unlock it, and try again."; exit 1; }
xcodebuild -workspace MyPortfolio.xcworkspace -scheme MyPortfolio -configuration Release \
  -destination id="$DEVICE" -derivedDataPath build -allowProvisioningUpdates build -quiet
xcrun devicectl device install app --device "$DEVICE" build/Build/Products/Release-iphoneos/MyPortfolio.app
echo "Done: My Portfolio reinstalled."
