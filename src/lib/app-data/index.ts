import { appLocalDataDir } from "@tauri-apps/api/path";
import {
	BaseDirectory,
	exists,
	mkdir,
	readFile,
	remove,
	rename,
	writeFile,
} from "@tauri-apps/plugin-fs";

export async function existsAppDataFile(path: string) {
	return await exists(path, { baseDir: BaseDirectory.AppLocalData });
}

export async function readAppDataFile(path: string) {
	return await readFile(path, { baseDir: BaseDirectory.AppLocalData });
}

export async function removeAppDataFile(path: string) {
	if (!(await existsAppDataFile(path))) return;
	await remove(path, { baseDir: BaseDirectory.AppLocalData });
}

export async function writeAppDataFileAtomic({
	path,
	content,
}: {
	path: string;
	content: Uint8Array;
}) {
	await mkdir(await appLocalDataDir(), { recursive: true });
	const tempPath = `${path}.tmp`;
	await writeFile(tempPath, content, { baseDir: BaseDirectory.AppLocalData });
	await rename(tempPath, path, {
		oldPathBaseDir: BaseDirectory.AppLocalData,
		newPathBaseDir: BaseDirectory.AppLocalData,
	});
}
