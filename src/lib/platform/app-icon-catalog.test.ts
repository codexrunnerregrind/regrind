import { existsSync, readFileSync } from "fs";
import { describe, expect, it } from "vitest";

import {
	allAppIconIds,
	androidAppIconAlias,
	appIconColors,
	appIcons,
	iosAppIconName,
	parseAppIconId,
} from "$lib/platform/app-icon-catalog";

const read = (path: string) => readFileSync(path, "utf8");

const iosNames = allAppIconIds.map(iosAppIconName);

describe("app icon catalog", () => {
	it("has every glyph in every color", () => {
		expect(allAppIconIds).toHaveLength(
			appIcons.length * appIconColors.length,
		);
		expect(parseAppIconId("weather-blue")).toEqual({
			glyph: "weather",
			color: "blue",
		});
		expect(parseAppIconId("clock")).toBeNull();
		expect(iosAppIconName("weather-blue")).toBe("AppIcon-Weather-Blue");
		expect(androidAppIconAlias("weather-blue")).toBe("AppIconWeather_Blue");
	});

	it("has an Android launcher alias per icon", () => {
		const manifest = read(
			"src-tauri/gen/android/app/src/main/AndroidManifest.xml",
		);
		const aliases = [
			...manifest.matchAll(/android:name="\.(AppIcon\w+)"/g),
		].map((match) => match[1]);
		expect(aliases).toEqual([
			"AppIconDefault",
			...allAppIconIds.map(androidAppIconAlias),
		]);
	});

	it("lists every iOS icon set in both Xcode configurations", () => {
		const setting = `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "${iosNames.join(" ")}";`;
		const pbxproj = read(
			"src-tauri/gen/apple/regrind.xcodeproj/project.pbxproj",
		);
		expect(pbxproj.split(setting)).toHaveLength(3);
		expect(read("src-tauri/gen/apple/project.yml")).toContain(
			`ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES: ${iosNames.join(" ")}`,
		);
	});

	it("has generated art for every icon", () => {
		for (const id of allAppIconIds) {
			expect(existsSync(`src/lib/assets/app-icons/${id}.svg`)).toBe(true);
			expect(
				existsSync(
					`src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_alt_${id.replace("-", "_")}.xml`,
				),
			).toBe(true);
		}
		for (const name of iosNames)
			for (const file of ["AppIcon", "AppIcon-Dark", "AppIcon-Tinted"])
				expect(
					existsSync(
						`src-tauri/gen/apple/Assets.xcassets/${name}.appiconset/${file}.png`,
					),
				).toBe(true);
	});
});
