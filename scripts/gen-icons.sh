#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

RES="src-tauri/gen/android/app/src/main/res"

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
  contrib/logo/app-foreground-icon.svg \
  "$RES/drawable/ic_launcher_monochrome.xml" \
  --width 108 --height 108 --scale 0.9 --mono '#FFFFFF'

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

# macOS .icns. `tauri icon` only resizes, so the margin and corner radius macOS
# expects have to come pre-baked from a separate source.
bun tauri icon ./contrib/logo/app-icon-macos.svg -o "$TMP/macos" >/dev/null
cp "$TMP/macos/icon.icns" contrib/logo/icon.icns
cp contrib/logo/icon.icns src-tauri/icons/icon.icns

# Raster exports of the icon and of the bare mark
bun tauri icon ./contrib/logo/app-icon.svg --ios-color='#0A0A0A' -o "$TMP/app" >/dev/null
cp "$TMP/app/ios/AppIcon-512@2x.png" contrib/logo/app-icon.png

bun tauri icon ./contrib/logo/open-grind.svg -o "$TMP/mark" >/dev/null
cp "$TMP/mark/icon.png" contrib/logo/open-grind-512px.png
cp "$TMP/mark/128x128.png" src/lib/assets/favicon.png
sips -Z 180 "$TMP/mark/icon.png" --out contrib/logo/open-grind-180px.png >/dev/null
