#!/bin/sh
set -eu

bundle="${1:?usage: ci/play-upload.sh <signed.aab>}"
root="$(cd "$(dirname "$0")/.." && pwd)"

exec fastlane supply \
	--package_name org.regrind \
	--track internal \
	--aab "$bundle" \
	--metadata_path "$root/fastlane/metadata/android" \
	--sync_image_upload true
