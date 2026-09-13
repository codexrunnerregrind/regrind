import { $ } from "bun";
import { dirname } from "node:path";

import { verifyDetached } from "../../../scripts/lib/minisign";
import { repo } from "./config";

async function releaseKey(): Promise<string> {
	const keysDocument = `${repo}/KEYS.md`;
	const keys = new Set(
		(await Bun.file(keysDocument).text())
			.split(/[\s;`]/)
			.filter((token) => token.startsWith("RW") && token.length === 56),
	);
	const [key] = keys;
	if (!key || keys.size > 1) {
		throw new Error(
			`${keysDocument} has to publish exactly one minisign key, found ${keys.size}`,
		);
	}
	return key;
}

async function verifies({
	file,
	signature,
	key,
}: {
	file: string;
	signature: string;
	key: string;
}): Promise<boolean> {
	if (!(await Bun.file(signature).exists())) return false;
	try {
		await verifyDetached(file, await Bun.file(signature).text(), key);
		return true;
	} catch {
		return false;
	}
}

async function fetchInto({
	url,
	file,
}: {
	url: string;
	file: string;
}): Promise<void> {
	const { exitCode } = await $`curl -fL --output ${file} ${url}`.nothrow();
	if (exitCode !== 0) throw new Error(`could not download ${url}`);
}

export async function verifiedDownload({
	url,
	file,
}: {
	url: string;
	file: string;
}): Promise<string> {
	const key = await releaseKey();
	const signature = `${file}.minisig`;
	if (await verifies({ file, signature, key })) return file;

	const part = `${file}.part`;
	await $`rm -f ${file} ${signature} ${part}`;
	await $`mkdir -p ${dirname(file)}`;
	console.log(`downloading ${url}…`);
	await fetchInto({ url: `${url}.minisig`, file: signature });
	await fetchInto({ url, file: part });
	await $`mv ${part} ${file}`;
	if (!(await verifies({ file, signature, key }))) {
		await $`rm -f ${file} ${signature}`;
		throw new Error(`${url} does not verify against the key in KEYS.md`);
	}
	return file;
}
