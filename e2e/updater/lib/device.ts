import { $ } from "bun";

import { androidPackage, overrideFile, port, state } from "./config";

const adb = Bun.env.ADB ?? "adb";
const activity = `${androidPackage}/${androidPackage}.MainActivity`;

export async function requireDevice(): Promise<string> {
	if (!Bun.which(adb)) {
		throw new Error(
			`${adb} not found — set ADB or run inside 'nix develop'`,
		);
	}
	const attached = (await $`${adb} devices`.text())
		.split("\n")
		.slice(1)
		.map((row) => row.trim())
		.filter((row) => row.endsWith("\tdevice"))
		.map((row) => row.split("\t")[0] ?? "");

	if (!attached.length) {
		throw new Error(
			"no authorised device — plug the phone in and accept the USB debugging prompt",
		);
	}
	if (attached.length > 1 && !Bun.env.ANDROID_SERIAL) {
		throw new Error(
			`${attached.length} devices attached — set ANDROID_SERIAL to one of ${attached.join(", ")}`,
		);
	}
	return Bun.env.ANDROID_SERIAL ?? attached[0] ?? "";
}

export async function installApk(apk: string): Promise<void> {
	const result = await $`${adb} install -r -d ${apk}`.quiet().nothrow();
	if (result.exitCode !== 0) {
		const reason = (
			result.stderr.toString() || result.stdout.toString()
		).trim();
		throw new Error(`adb install ${apk} failed: ${reason}`);
	}
}

export async function clearAppData(): Promise<void> {
	await $`${adb} shell pm clear ${androidPackage}`.quiet().nothrow();
}

export async function uninstallPackage(packageName: string): Promise<void> {
	await $`${adb} uninstall ${packageName}`.quiet().nothrow();
}

async function packageDump(packageName: string): Promise<string> {
	return $`${adb} shell dumpsys package ${packageName}`
		.text()
		.catch(() => "");
}

function versionNameIn(dump: string): string | null {
	return /versionName=(\S+)/.exec(dump)?.[1] ?? null;
}

export async function packageVersionName(
	packageName: string,
): Promise<string | null> {
	return versionNameIn(await packageDump(packageName));
}

export async function installedVersion(
	packageName: string = androidPackage,
): Promise<string> {
	const dump = await packageDump(packageName);
	const name = versionNameIn(dump) ?? "none";
	const code = /versionCode=(\d+)/.exec(dump)?.[1] ?? "?";
	return `${name} (${code})`;
}

export async function canInstallPackages(): Promise<boolean> {
	const mode =
		await $`${adb} shell appops get ${androidPackage} REQUEST_INSTALL_PACKAGES`
			.text()
			.catch(() => "");
	return mode.includes("allow");
}

export async function bridge(): Promise<void> {
	await $`${adb} reverse tcp:${port} tcp:${port}`.quiet();
}

export async function unbridge(): Promise<void> {
	await $`${adb} reverse --remove tcp:${port}`.quiet().nothrow();
}

export async function writeOverride({
	origin,
	key,
}: {
	origin: string;
	key: string;
}): Promise<void> {
	const local = `${state}/update.env`;
	await Bun.write(
		local,
		`OPEN_GRIND_UPDATE_ORIGIN=${origin}\nOPEN_GRIND_UPDATE_KEY=${key}\n`,
	);
	await $`${adb} push ${local} ${overrideFile}`.quiet();
	await $`${adb} shell chmod 644 ${overrideFile}`.quiet();
}

export async function clearOverride(): Promise<void> {
	await $`${adb} shell rm -f ${overrideFile}`.quiet().nothrow();
}

export async function launchApp(): Promise<void> {
	await $`${adb} shell am force-stop ${androidPackage}`.quiet().nothrow();
	await $`${adb} shell am start -n ${activity}`.quiet();
}

export async function stopApp(): Promise<void> {
	await $`${adb} shell am force-stop ${androidPackage}`.quiet().nothrow();
}
