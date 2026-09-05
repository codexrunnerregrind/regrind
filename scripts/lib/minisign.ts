// A minisign implementation, so signing a release needs no minisign binary.
// Formats follow https://jedisct1.github.io/minisign/#signature-format.
import crypto from "node:crypto";

const SIGN_ALG = "Ed";
const PREHASHED_ALG = "ED";
const KDF_NONE = 0x0000;
const CKSUM_ALG = "B2";

const PKCS8_ED25519_PREFIX = Buffer.from(
	"302e020100300506032b657004220420",
	"hex",
);
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export type SecretKey = { keyId: Buffer; seed: Buffer; publicKey: Buffer };

function blake2b(algorithm: "blake2b256" | "blake2b512", input: Buffer) {
	return Buffer.from(new Bun.CryptoHasher(algorithm).update(input).digest());
}

function privateKeyOf(seed: Buffer) {
	return crypto.createPrivateKey({
		key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
		format: "der",
		type: "pkcs8",
	});
}

function publicKeyOf(publicKey: Buffer) {
	return crypto.createPublicKey({
		key: Buffer.concat([SPKI_ED25519_PREFIX, publicKey]),
		format: "der",
		type: "spki",
	});
}

function sign(seed: Buffer, message: Buffer) {
	return crypto.sign(null, message, privateKeyOf(seed));
}

// The checksum covers the algorithm, the key id and the libsodium secret key.
function secretChecksum(key: SecretKey) {
	return blake2b(
		"blake2b256",
		Buffer.concat([
			Buffer.from(SIGN_ALG),
			key.keyId,
			key.seed,
			key.publicKey,
		]),
	);
}

export function publicKeyLine(key: SecretKey): string {
	return Buffer.concat([
		Buffer.from(SIGN_ALG),
		key.keyId,
		key.publicKey,
	]).toString("base64");
}

export function parsePublicKeyLine(line: string): {
	keyId: Buffer;
	publicKey: Buffer;
} {
	const bytes = Buffer.from(line.trim(), "base64");
	if (bytes.length !== 42 || bytes.subarray(0, 2).toString() !== SIGN_ALG) {
		throw new Error("not a minisign Ed25519 public key");
	}
	return { keyId: bytes.subarray(2, 10), publicKey: bytes.subarray(10) };
}

export function generateKeypair(): SecretKey {
	const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
	const seed = privateKey
		.export({ format: "der", type: "pkcs8" })
		.subarray(PKCS8_ED25519_PREFIX.length);
	return {
		keyId: crypto.randomBytes(8),
		seed,
		publicKey: publicKey
			.export({ format: "der", type: "spki" })
			.subarray(SPKI_ED25519_PREFIX.length),
	};
}

export function encodeSecretKey(key: SecretKey): string {
	const header = Buffer.alloc(6 + 32 + 8 + 8);
	header.write(SIGN_ALG, 0, "latin1");
	header.writeUInt16BE(KDF_NONE, 2);
	header.write(CKSUM_ALG, 4, "latin1");
	// An unencrypted key leaves the salt and the scrypt limits zeroed.
	return Buffer.concat([
		header,
		key.keyId,
		key.seed,
		key.publicKey,
		secretChecksum(key),
	]).toString("base64");
}

export function decodeSecretKey(contents: string): SecretKey {
	const line = contents
		.split("\n")
		.map((entry) => entry.trim())
		.find((entry) => entry.length > 0 && !entry.startsWith("untrusted"));
	if (!line) throw new Error("the secret key file holds no key");

	const bytes = Buffer.from(line, "base64");
	if (bytes.length !== 158) {
		throw new Error("the secret key has the wrong length");
	}
	if (bytes.subarray(0, 2).toString() !== SIGN_ALG) {
		throw new Error("not a minisign Ed25519 secret key");
	}
	if (bytes.readUInt16BE(2) !== KDF_NONE) {
		throw new Error(
			"the secret key is password protected, which this signer cannot read",
		);
	}
	const key: SecretKey = {
		keyId: bytes.subarray(54, 62),
		seed: bytes.subarray(62, 94),
		publicKey: bytes.subarray(94, 126),
	};
	if (!secretChecksum(key).equals(bytes.subarray(126))) {
		throw new Error("the secret key is corrupt");
	}
	return key;
}

export async function prehash(path: string): Promise<Buffer> {
	const hasher = new Bun.CryptoHasher("blake2b512");
	for await (const chunk of Bun.file(path).stream()) {
		hasher.update(chunk);
	}
	return Buffer.from(hasher.digest());
}

// Detached prehashed signature, with the trusted comment the updater reads.
export async function signDetached(
	path: string,
	key: SecretKey,
): Promise<string> {
	const name = path.split("/").pop() ?? path;
	const signature = sign(key.seed, await prehash(path));
	const blob = Buffer.concat([
		Buffer.from(PREHASHED_ALG),
		key.keyId,
		signature,
	]);
	const trusted = `timestamp:${Math.floor(Date.now() / 1000)}\tfile:${name}\thashed`;
	const global = sign(
		key.seed,
		Buffer.concat([signature, Buffer.from(trusted)]),
	);
	return [
		`untrusted comment: signature from minisign secret key`,
		blob.toString("base64"),
		`trusted comment: ${trusted}`,
		global.toString("base64"),
		"",
	].join("\n");
}

export async function verifyDetached(
	path: string,
	signature: string,
	publicKeyLine: string,
): Promise<void> {
	const { publicKey } = parsePublicKeyLine(publicKeyLine);
	const key = publicKeyOf(publicKey);
	const [, blobLine, commentLine, globalLine] = signature.split("\n");
	const blob = Buffer.from((blobLine ?? "").trim(), "base64");
	if (
		blob.length !== 74 ||
		blob.subarray(0, 2).toString() !== PREHASHED_ALG
	) {
		throw new Error("not a prehashed minisign signature");
	}
	const trusted = (commentLine ?? "").replace(/^trusted comment: /, "");
	if (trusted === commentLine) {
		throw new Error("the signature has no trusted comment");
	}
	const detached = blob.subarray(10);
	if (!crypto.verify(null, await prehash(path), key, detached)) {
		throw new Error("the payload does not match the signature");
	}
	const global = Buffer.from((globalLine ?? "").trim(), "base64");
	const signed = Buffer.concat([detached, Buffer.from(trusted)]);
	if (!crypto.verify(null, signed, key, global)) {
		throw new Error("the trusted comment does not match the signature");
	}
	const name = path.split("/").pop() ?? path;
	const named = trusted
		.split("\t")
		.find((field) => field.startsWith("file:"))
		?.slice("file:".length);
	if (named !== name) throw new Error("the signature names another file");
}
