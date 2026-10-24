#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

RES="src-tauri/gen/android/app/src/main/res"
DEBUG_RES="src-tauri/gen/android/app/src/debug/res"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Desktop + iOS icons
bun tauri icon ./contrib/logo/app-icon.svg --ios-color='#0A0A0A'

# Android
rm -f "$RES"/mipmap-*dpi/ic_launcher.png \
      "$RES"/mipmap-*dpi/ic_launcher_round.png \
      "$RES"/mipmap-*dpi/ic_launcher_foreground.png \
      "$RES"/mipmap-anydpi-v26/ic_launcher_round.xml \
      "$RES"/drawable-v24/ic_launcher_foreground.xml \
      "$RES"/drawable/ic_launcher_background.xml
rmdir "$RES"/mipmap-mdpi "$RES"/mipmap-hdpi "$RES"/mipmap-xhdpi \
      "$RES"/mipmap-xxhdpi "$RES"/mipmap-xxxhdpi "$RES"/drawable-v24 2>/dev/null || true

mkdir -p "$RES/drawable"

# Foreground vector
bun scripts/svg-to-android-vector.ts \
  contrib/logo/app-foreground-icon.svg \
  "$RES/drawable/ic_launcher_foreground.xml" \
  --width 108 --height 108 --scale 0.9

# Monochrome icons
bun scripts/svg-to-android-vector.ts \
  contrib/logo/app-monochrome-icon.svg \
  "$RES/drawable/ic_launcher_monochrome.xml" \
  --width 108 --height 108 --scale 0.9 --mono '#FFFFFF'

# Debug-build foreground, badged DEV. Gradle's debug source set overrides the
# same-named drawable in main/, so debug installs are told apart from release
# ones: they share applicationId and signing key otherwise.
mkdir -p "$DEBUG_RES/drawable"
bun scripts/svg-to-android-vector.ts \
  contrib/logo/app-foreground-icon-dev.svg \
  "$DEBUG_RES/drawable/ic_launcher_foreground.xml" \
  --width 108 --height 108 --scale 0.9

# Notification small icon: Material's 24dp frame with a 20dp live area, so the
# mark fills the status bar instead of the launcher icon's adaptive safe zone
bun scripts/svg-to-android-vector.ts \
  contrib/logo/app-foreground-icon.svg \
  "$RES/drawable/ic_notification.xml" \
  --width 24 --height 24 --scale 1.6414 \
  --translate-x 0.82 --translate-y -46.78 --mono '#FFFFFF'

# Adaptive icon
cat > "$RES/mipmap-anydpi-v26/ic_launcher.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <foreground android:drawable="@drawable/ic_launcher_foreground"/>
  <background android:drawable="@color/ic_launcher_background"/>
  <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
XML

cat > "$RES/values/ic_launcher_background.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#0A0A0A</color>
</resources>
XML

# iOS DEV-badged icon set, the default every local build carries
# (project.yml points ASSETCATALOG_COMPILER_APPICON_NAME at it); only the public
# release opts back out to the plain AppIcon, in scripts/ios-release-ipa.sh.
DEV_SET="src-tauri/gen/apple/Assets.xcassets/AppIcon-Dev.appiconset"
bun tauri icon ./contrib/logo/app-icon-dev.svg --ios-color='#0A0A0A' -o "$TMP/dev" >/dev/null
rm -rf "$DEV_SET"
mkdir -p "$DEV_SET"
cp "$TMP"/dev/ios/AppIcon-*.png "$DEV_SET/"
cp src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/Contents.json "$DEV_SET/"

# macOS .icns. `tauri icon` only resizes, so the margin and corner radius macOS
# expects have to come pre-baked from a separate source.
bun tauri icon ./contrib/logo/app-icon-macos.svg -o "$TMP/macos" >/dev/null
cp "$TMP/macos/icon.icns" contrib/logo/icon.icns
cp contrib/logo/icon.icns src-tauri/icons/icon.icns

# Raster exports of the icon and of the bare mark
bun tauri icon ./contrib/logo/app-icon.svg --ios-color='#0A0A0A' -o "$TMP/app" >/dev/null
cp "$TMP/app/ios/AppIcon-512@2x.png" contrib/logo/app-icon.png

bun tauri icon ./contrib/logo/regrind.svg -o "$TMP/mark" >/dev/null
cp "$TMP/mark/icon.png" contrib/logo/regrind-512px.png
cp "$TMP/mark/128x128.png" src/lib/assets/favicon.png
sips -Z 180 "$TMP/mark/icon.png" --out contrib/logo/regrind-180px.png >/dev/null

# Alternate (discreet) app icons for iOS, Android and the settings previews
bun scripts/gen-app-icons.ts
