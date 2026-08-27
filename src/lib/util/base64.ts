export function fromBase64(b64: string): Uint8Array {
	if (typeof Uint8Array.fromBase64 === "function") {
		return Uint8Array.fromBase64(b64);
	}
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export function toBase64(bytes: Uint8Array): string {
	if (typeof bytes.toBase64 === "function") {
		return bytes.toBase64();
	}
	let bin = "";
	for (const byte of bytes) bin += String.fromCharCode(byte);
	return btoa(bin);
}

export function toBase64Url(bytes: Uint8Array): string {
	return toBase64(bytes)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

export function fromBase64Url(b64url: string): Uint8Array {
	const b64 = b64url.replaceAll("-", "+").replaceAll("_", "/");
	// `toBase64Url` strips the padding the decoders want back.
	return fromBase64(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
}
