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
# Writes src-tauri/gen/apple/build/arm64/regrind-v<version>.ipa and updates
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

BUILD_DIR="src-tauri/gen/apple/build"
ARCHIVE="$BUILD_DIR/regrind_iOS.xcarchive"
ARCHIVE_APP="$ARCHIVE/Products/Applications/ReGrind.app"
UNSIGNED="$BUILD_DIR/arm64/regrind-v$VERSION.ipa"

# The source is the xcarchive bundle, not build/arm64/*.ipa. `tauri ios build`
# reliably dies at `exportArchive` on this setup ("No Account for Team
# $(APPLE_DEVELOPMENT_TEAM)"), so the exported IPA often does not exist — but the
# compile and sign phases have already run, and the archive holds a fully
# device-signed bundle. Tolerate the export failure and judge the build by
# whether the archive is fresh, so a genuine compile failure still stops us.
if [ "$SKIP_BUILD" = false ]; then
	if [ -z "${APPLE_DEVELOPMENT_TEAM:-}" ]; then
		echo "APPLE_DEVELOPMENT_TEAM is unset; see BUILDING.md" >&2
		exit 1
	fi
	STARTED="$(mktemp)"
	# Every local build is DEV-badged by default (see gen/apple/project.yml), and
	# the release is release-config like a sideload, so it can't opt out of the
	# badge by configuration. Swap the project to the plain AppIcon for this
	# build, then restore it — `git checkout` also undoes the DEVELOPMENT_TEAM
	# literal `tauri ios build` writes in.
	PBXPROJ="src-tauri/gen/apple/regrind.xcodeproj/project.pbxproj"
	sed -i '' 's/ASSETCATALOG_COMPILER_APPICON_NAME = "AppIcon-Dev";/ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/g' "$PBXPROJ"
	bun run tauri ios build || echo "build reported failure; checking the archive"
	git checkout -- "$PBXPROJ" 2>/dev/null || true
	if [ ! -d "$ARCHIVE_APP" ] || [ ! "$ARCHIVE_APP" -nt "$STARTED" ]; then
		rm -f "$STARTED"
		echo "no bundle newer than this run at $ARCHIVE_APP —" >&2
		echo "the build failed before signing, not just at export" >&2
		exit 1
	fi
	rm -f "$STARTED"
fi

if [ ! -d "$ARCHIVE_APP" ]; then
	echo "no build at $ARCHIVE_APP — drop --skip-build" >&2
	exit 1
fi

# Repack out of tree so a stale Payload/ can never leak into the artifact, and
# so stripping never touches the archive the device install uses.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir "$WORK/Payload"
# zip records this directory's own entry, so pin its mtime to the archive's too.
touch -r "$ARCHIVE_APP" "$WORK/Payload"
# -p, or the copy gets fresh mtimes and every repack of an identical archive
# produces a different zip — which silently invalidates a manifest generated
# from an earlier run.
cp -Rp "$ARCHIVE_APP" "$WORK/Payload/"
APP="$WORK/Payload/$(basename "$ARCHIVE_APP")"

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

# Advertise the beta number in the short version, because that string is the
# only thing SideStore compares. `InstalledApp.hasUpdate` parses `version` from
# the manifest as semver and compares it to what is installed; buildVersion is
# read only when that parse *fails*. Tauri drops the prerelease suffix, so every
# beta ships CFBundleShortVersionString `0.1.0` and each release looks identical
# to the one before it — no update is ever offered. Copying CFBundleVersion
# (`0.1.0.5`) over it gives each beta a distinct string that, having four
# components, cannot parse as semver, so SideStore falls back to comparing
# version *and* buildVersion — AltStore's documented rule. The manifest reads
# this same plist, so the two cannot drift, and the value keeps working when a
# plain `0.1.0` eventually ships.
#
# Safe only because the release IPA is unsigned: editing Info.plist would break
# a signature, and the strip below removes it anyway.
#
# `plutil -replace`, not PlistBuddy: PlistBuddy writes the file back as XML,
# and Xcode ships Info.plist as a binary plist. plutil edits in place and keeps
# the format, so the only difference from what the build produced is the one
# value. Assert that, since a format flip is silent otherwise.
SHORT_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' \
	"$APP/Info.plist")"
plutil -replace CFBundleShortVersionString -string "$SHORT_VERSION" \
	"$APP/Info.plist"
case "$(file -b "$APP/Info.plist")" in
*'binary property list'*) ;;
*)
	echo "Info.plist is no longer a binary plist after the version rewrite" >&2
	exit 1
	;;
esac

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

# Stripping rewrites files, so their mtimes become "now" and every repack of an
# identical archive yields a different zip — which invalidates the size/sha256 in
# a manifest generated from an earlier run. Pin them all back to the archive,
# deepest first so touching a child does not re-dirty its parent.
find "$WORK/Payload" -depth -exec touch -r "$ARCHIVE_APP" {} +

# Sorted entry order so two builds of the same tree differ only where Xcode
# itself is non-deterministic; -X drops the local uid/gid/extra attributes.
mkdir -p "$(dirname "$ROOT/$UNSIGNED")"
rm -f "$ROOT/$UNSIGNED"
(cd "$WORK" && find Payload -print | LC_ALL=C sort |
	zip -qX "$ROOT/$UNSIGNED" -@)

bun ci/altstore/source.ts "$UNSIGNED" ${DATE_ARGS[@]+"${DATE_ARGS[@]}"}

echo
echo "unsigned IPA: $UNSIGNED"
echo "next: attach it to the v$VERSION release, then commit ci/altstore/source.json"
