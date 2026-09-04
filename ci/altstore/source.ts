/**
 * Generates the AltStore-format source manifest used by SideStore, AltStore and
 * TrollApps to install and update ReGrind on iOS.
 *
 * The manifest is a static JSON file served over HTTPS; users add its URL as a
 * "source" in their sideloading client and get install + update notifications.
 * Size and SHA-256 must match the published IPA byte-for-byte, so they are read
 * from the artifact rather than hand-written.
 *
 *   bun ci/altstore/source.ts <path-to-ipa> [--date YYYY-MM-DD]
 *
 * Writes ci/altstore/source.json.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// This fork publishes the iOS builds, so the manifest has to point at the
// fork's releases and raw files — upstream ships no IPA and every URL under it
// would 404. Override to retarget a different mirror.
const REPO =
	process.env.OPEN_GRIND_REPO ??
	"https://git.opengrind.org/codexrunner/regrind";
const RAW = `${REPO}/raw/branch/main`;
const METADATA = "fastlane/metadata/android/en-US";
const SHOTS = "contrib/altstore";
// The fork's own artwork; fastlane/metadata still carries upstream's mask icon.
// The full app icon, not the bare mark: a store listing wants the icon a user
// will see on their home screen, background and grid included.
const ICON = "contrib/logo/app-icon.png";
const LISTING = "ci/altstore";

const root = resolve(import.meta.dir, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").trim();
const fail = (message: string): never => {
	console.error(`error: ${message}`);
	process.exit(1);
};

// Numeric prefix is the listing order, so adding or reordering a screenshot is a
// file rename rather than a code change. Sorted numerically — a plain sort puts
// 10 before 2.
const screenshots = () => {
	const files = readdirSync(resolve(root, SHOTS))
		.filter((f) => f.endsWith(".jpeg"))
		.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
	if (!files.length) fail(`no screenshots in ${SHOTS}`);
	return files.map((f) => `${RAW}/${SHOTS}/${f}`);
};

const ipaPath = process.argv[2];
if (!ipaPath) {
	console.error(
		"usage: bun ci/altstore/source.ts <path-to-ipa> [--date YYYY-MM-DD]",
	);
	process.exit(1);
}

const dateFlag = process.argv.indexOf("--date");
const date =
	dateFlag !== -1
		? process.argv[dateFlag + 1]
		: new Date().toISOString().slice(0, 10);

const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const { version, identifier } = tauri;

// The release tag and asset filename come from this version, so running on a
// -dev tree would rewrite the live manifest to point at a release that will
// never exist. Main carries -dev between releases (see scripts/check-version.ts),
// so this is the normal state of the tree, not an edge case.
if (/(^|[-.])dev($|[-.])/.test(version.split("-").slice(1).join("-"))) {
	fail(
		`refusing to generate from development version ${version}; ` +
			"set the release version first",
	);
}

const ipa = readFileSync(ipaPath);
const sha256 = createHash("sha256").update(ipa).digest("hex");
const size = statSync(ipaPath).size;

// The manifest's version must be what the *bundle* declares, not what
// tauri.conf.json says. iOS requires CFBundleShortVersionString to be numeric,
// so Tauri drops the prerelease suffix: `0.1.0-beta.5` in the config ships as
// `0.1.0` in the IPA. Advertising the config value makes SideStore refuse the
// install with VerificationError 4, "the downloaded version does not match the
// version specified by the source". So read both strings out of the IPA itself.
// scripts/ios-release-ipa.sh copies CFBundleVersion (`0.1.0.5`) over the short
// version before packing, precisely so this reads a string that differs between
// betas — SideStore compares `version` and nothing else unless that parse fails.
const plist = Bun.spawnSync([
	"unzip",
	"-p",
	ipaPath,
	"Payload/*.app/Info.plist",
]).stdout;
const plistValue = (key: string) => {
	const { stdout, exitCode } = Bun.spawnSync(
		["plutil", "-extract", key, "raw", "-o", "-", "-"],
		{ stdin: plist },
	);
	if (exitCode !== 0) fail(`${key} missing from the IPA's Info.plist`);
	return stdout.toString().trim();
};
const shortVersion = plistValue("CFBundleShortVersionString");
const buildVersion = plistValue("CFBundleVersion");

const bundleId = plistValue("CFBundleIdentifier");
if (bundleId !== identifier) {
	fail(`IPA is ${bundleId} but tauri.conf.json says ${identifier}`);
}

// This fork's own listing text, not fastlane/metadata — that describes
// upstream's features and says nothing about the redesign or anything added
// here. Kept as plain text, which is what AltStore renders, so unlike the
// Play/F-Droid copy it needs no HTML stripping. fastlane/metadata stays as it
// is for F-Droid and Play.
const description = read(`${LISTING}/description.txt`);
const subtitle = read(`${LISTING}/subtitle.txt`);

const changelog = (() => {
	try {
		return read(
			`${METADATA}/changelogs/${tauri.bundle.android.versionCode}.txt`,
		);
	} catch {
		return `ReGrind ${version}.`;
	}
})();

const source = {
	name: "ReGrind (codexrunner)",
	// Distinct from upstream's, so adding both does not collide in a client that
	// keys sources by identifier.
	identifier: "org.opengrind.source.codexrunner",
	// Lets a client refresh the manifest in place if it ever moves.
	sourceURL: `${RAW}/ci/altstore/source.json`,
	subtitle,
	description,
	iconURL: `${RAW}/${ICON}`,
	website: REPO,
	tintColor: "0DB28F",
	apps: [
		{
			name: read(`${METADATA}/title.txt`),
			bundleIdentifier: identifier,
			developerName: "codexrunner",
			subtitle,
			localizedDescription: description,
			iconURL: `${RAW}/${ICON}`,
			tintColor: "0DB28F",
			category: "social",
			// This fork's own screenshots, not the ones under
			// fastlane/metadata — those are upstream's Play/F-Droid listing,
			// byte-identical to origin/main, and show the original UI rather
			// than the redesign. Converted from contrib/screenshots (demo mode,
			// so no real profiles) to JPEG, since the AltStore format does not
			// document WebP support. Order is the listing order.
			screenshots: screenshots(),
			versions: [
				{
					// From the bundle, so SideStore's check passes; the release
					// tag and filename keep the full `version` from the config.
					version: shortVersion,
					buildVersion,
					date,
					localizedDescription: changelog,
					downloadURL: `${REPO}/releases/download/v${version}/regrind-v${version}.ipa`,
					size,
					sha256,
					minOSVersion: "14.0",
				},
			],
		},
	],
	news: [],
};

const out = resolve(root, "ci/altstore/source.json");
writeFileSync(out, `${JSON.stringify(source, null, "\t")}\n`);
console.log(`wrote ${out}`);
console.log(`  version ${version} (${identifier})`);
console.log(`  ${(size / 1024 / 1024).toFixed(1)} MiB, sha256 ${sha256}`);
