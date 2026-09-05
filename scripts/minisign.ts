#!/usr/bin/env bun
// Generate the fork's release key and sign release artifacts with it.
import { chmodSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
	decodeSecretKey,
	encodeSecretKey,
	generateKeypair,
	publicKeyLine,
	signDetached,
	verifyDetached,
} from "./lib/minisign";

const home = process.env.HOME ?? "~";
const defaultKey = `${home}/.config/regrind/minisign.key`;
const secretPath = process.env.REGRIND_MINISIGN_KEY ?? defaultKey;

function publishedKey(): string {
	const keys = readFileSync(
		path.join(import.meta.dir, "..", "KEYS.md"),
		"utf8",
	)
		.split(/\s|`/)
		.filter((token) => token.startsWith("RW") && token.length === 56);
	const [key] = keys;
	if (!key) throw new Error("KEYS.md publishes no minisign key");
	return key;
}

async function secretKey() {
	if (!existsSync(secretPath)) {
		throw new Error(`no release key at ${secretPath}, run 'keygen' first`);
	}
	return decodeSecretKey(await Bun.file(secretPath).text());
}

const [command, target] = process.argv.slice(2);

switch (command) {
	case "keygen": {
		if (existsSync(secretPath)) {
			console.error(
				`${secretPath} already exists, refusing to replace it`,
			);
			process.exit(1);
		}
		const key = generateKeypair();
		await Bun.write(
			secretPath,
			`untrusted comment: ReGrind release secret key\n${encodeSecretKey(key)}\n`,
		);
		chmodSync(secretPath, 0o600);
		const published = publicKeyLine(key);
		await Bun.write(
			`${secretPath.replace(/\.key$/, "")}.pub`,
			`untrusted comment: ReGrind release public key\n${published}\n`,
		);
		console.log(`secret key: ${secretPath}`);
		console.log(`public key: ${published}`);
		break;
	}
	case "sign": {
		if (!target) throw new Error("usage: minisign.ts sign <file>");
		const key = await secretKey();
		const signature = await signDetached(target, key);
		await Bun.write(`${target}.minisig`, signature);
		await verifyDetached(target, signature, publicKeyLine(key));
		if (publicKeyLine(key) !== publishedKey()) {
			console.error(
				"warning: this key is not the one published in KEYS.md",
			);
		}
		console.log(`signed: ${target}.minisig`);
		break;
	}
	case "verify": {
		if (!target) throw new Error("usage: minisign.ts verify <file>");
		await verifyDetached(
			target,
			await Bun.file(`${target}.minisig`).text(),
			publishedKey(),
		);
		console.log(`verified: ${target}`);
		break;
	}
	default:
		console.error(
			"usage: minisign.ts <keygen | sign <file> | verify <file>>",
		);
		process.exit(2);
}
