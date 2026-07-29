/**
 * Generates the AltStore-format source manifest used by SideStore, AltStore and
 * TrollApps to install and update Open Grind on iOS.
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
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = "https://git.opengrind.org/open-grind/open-grind";
const RAW = `${REPO}/raw/branch/main`;
const METADATA = "fastlane/metadata/android/en-US";

const root = resolve(import.meta.dir, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").trim();

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

const ipa = readFileSync(ipaPath);
const sha256 = createHash("sha256").update(ipa).digest("hex");
const size = statSync(ipaPath).size;

// The Play/F-Droid description is HTML; AltStore renders plain text.
const description = read(`${METADATA}/full_description.txt`)
	.replace(/<\/li>/g, "\n")
	.replace(/<li>/g, "\n• ")
	.replace(/<\/?(ul|b)>/g, "")
	.replace(/\n{3,}/g, "\n\n")
	.trim();

const changelog = (() => {
	try {
		return read(
			`${METADATA}/changelogs/${tauri.bundle.android.versionCode}.txt`,
		);
	} catch {
		return `Open Grind ${version}.`;
	}
})();

const source = {
	name: "Open Grind",
	identifier: "org.opengrind.source",
	subtitle: read(`${METADATA}/short_description.txt`),
	description,
	iconURL: `${RAW}/${METADATA}/images/icon.png`,
	website: "https://opengrind.org",
	tintColor: "0DB28F",
	apps: [
		{
			name: read(`${METADATA}/title.txt`),
			bundleIdentifier: identifier,
			developerName: "Open Grind Governance",
			subtitle: read(`${METADATA}/short_description.txt`),
			localizedDescription: description,
			iconURL: `${RAW}/${METADATA}/images/icon.png`,
			tintColor: "0DB28F",
			category: "social",
			screenshots: [1, 2, 3, 4, 5, 6].map(
				(n) => `${RAW}/${METADATA}/images/phoneScreenshots/${n}.jpeg`,
			),
			versions: [
				{
					version,
					date,
					localizedDescription: changelog,
					downloadURL: `${REPO}/releases/download/v${version}/open-grind-v${version}.ipa`,
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
