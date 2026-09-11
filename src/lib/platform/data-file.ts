import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { AndroidFs } from "tauri-plugin-android-fs-api";

import { demoEnabled } from "$lib/demo";
import { isAndroidPlatform, isIosPlatform } from "$lib/platform/os";

/** How a save ended. `cancelled` means the user backed out of a picker. */
export type SaveFileResult = {
	saved: boolean;
	cancelled: boolean;
	/** Set when iOS needs a fresh tap; call it from one. */
	shareFromGesture?: () => Promise<SaveFileResult>;
};

const JSON_MIME_TYPE = "application/json";

/**
 * Writes a text document wherever the user picks: save dialog on desktop,
 * document picker on Android, share sheet on iOS, download in the web build.
 */
export async function saveTextFile(
	filename: string,
	text: string,
	mimeType: string = JSON_MIME_TYPE,
): Promise<SaveFileResult> {
	const bytes = new TextEncoder().encode(text);

	if (demoEnabled) {
		downloadViaBrowser(new Blob([text], { type: mimeType }), filename);
		return { saved: true, cancelled: false };
	}

	if (isAndroidPlatform()) {
		const uri = await AndroidFs.showSaveFilePicker(filename, mimeType);
		if (uri === null) return { saved: false, cancelled: true };
		await AndroidFs.writeFile(uri, bytes);
		return { saved: true, cancelled: false };
	}

	if (isIosPlatform()) {
		return shareOrAskForATap(
			new File([bytes], filename, { type: mimeType }),
		);
	}

	const path = await save({
		defaultPath: filename,
		filters: [{ name: "JSON", extensions: [extensionOf(filename)] }],
	});
	if (path === null) return { saved: false, cancelled: true };
	await writeFile(path, bytes);
	return { saved: true, cancelled: false };
}

/** Reads a text document the user picks, or `null` if they backed out. */
export async function pickTextFile(
	extensions: string[] = ["json"],
	mimeTypes: string[] = [JSON_MIME_TYPE],
): Promise<string | null> {
	if (demoEnabled) {
		const file = await pickWebFile(mimeTypes, extensions);
		return file === null ? null : await file.text();
	}

	if (isAndroidPlatform()) {
		const [uri] = await AndroidFs.showOpenFilePicker({
			pickerType: "FilePicker",
			mimeTypes,
			multiple: false,
		});
		if (uri === undefined) return null;
		return decode(await AndroidFs.readFile(uri));
	}

	const path = await open({
		multiple: false,
		filters: [{ name: "JSON", extensions }],
	});
	if (path === null) return null;
	return decode(await readFile(path));
}

// Fatal: replacement characters would only fail later as a parse error.
function decode(bytes: Uint8Array): string {
	return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function extensionOf(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot < 0 ? "json" : filename.slice(dot + 1);
}

// Same expired-tap dance as saving media: WebKit only opens the share sheet
// while the tap behind it is still active.
async function shareOrAskForATap(file: File): Promise<SaveFileResult> {
	if (!navigator.canShare?.({ files: [file] })) {
		downloadViaBrowser(file, file.name);
		return { saved: true, cancelled: false };
	}
	try {
		await navigator.share({ files: [file] });
		return { saved: true, cancelled: false };
	} catch (error) {
		if (error instanceof DOMException) {
			if (error.name === "AbortError")
				return { saved: false, cancelled: true };
			if (error.name === "NotAllowedError") {
				return {
					saved: false,
					cancelled: false,
					shareFromGesture: () => shareOrAskForATap(file),
				};
			}
		}
		throw error;
	}
}

function pickWebFile(
	mimeTypes: string[],
	extensions: string[],
): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = [
			...mimeTypes,
			...extensions.map((extension) => `.${extension}`),
		].join(",");
		input.onchange = () => resolve(input.files?.[0] ?? null);
		input.oncancel = () => resolve(null);
		input.click();
	});
}

function downloadViaBrowser(blob: Blob, filename: string) {
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
}
