#!/usr/bin/env bash
# Build the iOS release artifact for sideloading and regenerate the AltStore
# source manifest from it.
#
# `tauri ios build` can only produce a *signed* IPA: Xcode embeds the
# provisioning profile it exported with, which carries the developer's team ID
# and the UDID of every device registered to that team. Publishing that is both
# a privacy leak and pointless — SideStore, AltStore and Feather discard the
# signature and re-sign under the installing user's own team. So strip it: the
# released IPA is unsigned and identical for everyone.
#
#   scripts/ios-release-ipa.sh [--skip-build] [--date YYYY-MM-DD]
#
# Writes src-tauri/gen/apple/build/arm64/open-grind-v<version>.ipa and updates
# ci/altstore/source.json to match it byte-for-byte.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_BUILD=false
DATE_ARGS=()
while [ $# -gt 0 ]; do
	case "$1" in
	--skip-build)
		SKIP_BUILD=true
		shift
		;;
	--date)
		DATE_ARGS=(--date "$2")
		shift 2
		;;
	*)
		echo "usage: scripts/ios-release-ipa.sh [--skip-build] [--date YYYY-MM-DD]" >&2
		exit 1
		;;
	esac
done

if [ "$(uname -s)" != Darwin ]; then
	echo "iOS builds require macOS with Xcode" >&2
	exit 1
fi

sh ci/check-release-version.sh

VERSION="$(sed -n 's/^[[:space:]]*"version": "\([^"]*\)".*/\1/p' \
	src-tauri/tauri.conf.json | head -1)"

BUILD_DIR="src-tauri/gen/apple/build/arm64"
SIGNED="$BUILD_DIR/Open Grind.ipa"
UNSIGNED="$BUILD_DIR/open-grind-v$VERSION.ipa"

if [ "$SKIP_BUILD" = false ]; then
	if [ -z "${APPLE_DEVELOPMENT_TEAM:-}" ]; then
		echo "APPLE_DEVELOPMENT_TEAM is unset; see BUILDING.md" >&2
		exit 1
	fi
	bun run tauri ios build
fi

if [ ! -f "$SIGNED" ]; then
	echo "no build at $SIGNED — drop --skip-build" >&2
	exit 1
fi

# Repack out of tree so a stale Payload/ can never leak into the artifact.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
unzip -q "$SIGNED" -d "$WORK"

APP="$(find "$WORK/Payload" -maxdepth 1 -name '*.app' | head -1)"
if [ -z "$APP" ]; then
	echo "no .app inside $SIGNED" >&2
	exit 1
fi

# The manifest takes the bundle ID from tauri.conf.json, but the IPA carries
# whatever it was built with — and a local device build may have patched
# `identifier` to keep its icon separate. Sideloaders key updates off the bundle
# ID, so a mismatch ships an app that can never be updated. Refuse instead.
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
	"$APP/Info.plist")"
IDENTIFIER="$(sed -n 's/^[[:space:]]*"identifier": "\([^"]*\)".*/\1/p' \
	src-tauri/tauri.conf.json | head -1)"
if [ "$BUNDLE_ID" != "$IDENTIFIER" ]; then
	echo "built $BUNDLE_ID but the manifest advertises $IDENTIFIER;" >&2
	echo "restore identifier in tauri.conf.json and rebuild" >&2
	exit 1
fi

# Deleting _CodeSignature/ and the profile is not enough: the signature and its
# entitlements blob — which carry the team ID and get-task-allow — live inside
# the Mach-O itself. Clear those first, deepest bundle outwards, then remove the
# provisioning profile, which additionally lists every registered device UDID.
while IFS= read -r nested; do
	codesign --remove-signature "$nested"
done < <(find "$WORK/Payload" -depth \( -name '*.framework' -o \
	-name '*.appex' -o -name '*.dylib' \))
codesign --remove-signature "$APP"

find "$WORK/Payload" -name _CodeSignature -type d -prune -exec rm -rf {} +
find "$WORK/Payload" -name embedded.mobileprovision -delete

if find "$WORK/Payload" \( -name '*.mobileprovision' -o \
	-name _CodeSignature \) | grep -q .; then
	echo "signature material survived the strip" >&2
	exit 1
fi
# codesign exits non-zero on an unsigned bundle, which is the outcome we want,
# so read its verdict rather than its status.
VERDICT="$(codesign -dv "$APP" 2>&1 || true)"
case "$VERDICT" in
*'not signed at all'*) ;;
*)
	echo "$APP is still signed: $VERDICT" >&2
	exit 1
	;;
esac

# Sorted entry order so two builds of the same tree differ only where Xcode
# itself is non-deterministic; -X drops the local uid/gid/extra attributes.
rm -f "$ROOT/$UNSIGNED"
(cd "$WORK" && find Payload -print | LC_ALL=C sort |
	zip -qX "$ROOT/$UNSIGNED" -@)

bun ci/altstore/source.ts "$UNSIGNED" ${DATE_ARGS[@]+"${DATE_ARGS[@]}"}

echo
echo "unsigned IPA: $UNSIGNED"
echo "next: attach it to the v$VERSION release, then commit ci/altstore/source.json"
