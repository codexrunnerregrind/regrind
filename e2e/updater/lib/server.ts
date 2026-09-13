import { $ } from "bun";

import {
	decodeSecretKey,
	encodeSecretKey,
	generateKeypair,
	publicKeyLine,
	signDetached,
} from "../../../scripts/lib/minisign";

const tick = 100;

export type Harness = {
	origin: string;
	publicKey: string;
	assets: string[];
	stop: () => Promise<void>;
};

export type Payload =
	| { file: string }
	| { bundle: string }
	| { invent: number };

export type Release = {
	repo?: string;
	stem?: string;
	payload: Payload;
	tag: string;
	suffix: string;
	uuid?: string;
	prerelease?: boolean;
	notes?: string;
};

export type ServerOptions = {
	releases: Release[];
	home: string;
	port: number;
	rate?: number;
	failMode?: string;
	journal?: string;
};

async function releaseKey(home: string): Promise<string> {
	const secret = `${home}/minisign.key`;
	await $`mkdir -p ${home}`;
	if (!(await Bun.file(secret).exists())) {
		await Bun.write(secret, `${encodeSecretKey(generateKeypair())}\n`);
	}
	return publicKeyLine(decodeSecretKey(await Bun.file(secret).text()));
}

async function sign(payload: string, home: string): Promise<void> {
	const key = decodeSecretKey(await Bun.file(`${home}/minisign.key`).text());
	await Bun.write(`${payload}.minisig`, await signDetached(payload, key));
}

async function signedPayload({
	source,
	name,
	home,
}: {
	source: Payload;
	name: string;
	home: string;
}) {
	const payload = `${home}/${name}`;
	const detached = `${payload}.minisig`;

	if ("invent" in source) {
		const signedAlready =
			(await Bun.file(payload).exists()) &&
			Bun.file(payload).size === source.invent;
		if (!signedAlready) {
			await Bun.write(
				payload,
				new Uint8Array(source.invent).map((_, index) => index % 251),
			);
			await sign(payload, home);
		}
	} else {
		await $`rm -f ${payload} ${detached}`;
		if ("bundle" in source) {
			await $`ditto -c -k --sequesterRsrc --keepParent ${source.bundle} ${payload}`;
		} else {
			await Bun.write(payload, Bun.file(source.file));
		}
		await sign(payload, home);
	}

	return {
		body: await Bun.file(payload).bytes(),
		signature: await Bun.file(detached).bytes(),
	};
}

function corrupted(bytes: Uint8Array): Uint8Array {
	const copy = new Uint8Array(bytes);
	const last = copy.length - 1;
	copy[last] = (copy[last] ?? 0) ^ 0xff;
	return copy;
}

function paced(
	bytes: Uint8Array,
	{ rate, failMode }: { rate: number; failMode: string },
) {
	const dropAt =
		failMode === "drop" ? Math.floor(bytes.byteLength * 0.4) : -1;
	if (!rate && dropAt < 0) return bytes;
	const step = Math.max(
		1,
		Math.round((rate * tick) / 1000) || bytes.byteLength,
	);
	let sent = 0;
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (dropAt >= 0 && sent >= dropAt) {
				controller.error(new Error("connection dropped"));
				return;
			}
			if (sent >= bytes.byteLength) {
				controller.close();
				return;
			}
			controller.enqueue(bytes.subarray(sent, sent + step));
			sent += step;
			await Bun.sleep(tick);
		},
	});
}

export async function startServer({
	releases,
	home,
	port,
	rate = 0,
	failMode = "",
	journal: journalPath,
}: ServerOptions): Promise<Harness> {
	const publicKey = await releaseKey(home);
	const origin = `http://127.0.0.1:${port}/`;
	if (journalPath) await $`rm -f ${journalPath}`;
	const journal = journalPath ? Bun.file(journalPath).writer() : null;

	const note = (request: Request) => {
		if (!journal) return;
		const url = new URL(request.url);
		journal.write(
			`${JSON.stringify({
				path: url.pathname,
				search: url.search,
				range: request.headers.get("range"),
				ifRange: request.headers.get("if-range"),
			})}\n`,
		);
		journal.flush();
	};

	const routes: Record<string, (request: Request) => Response> = {};
	const assets: string[] = [];
	const indexes = new Map<
		string,
		{ release: object; prerelease: boolean }[]
	>();

	for (const {
		repo = "open-grind",
		stem = "open-grind",
		payload,
		tag,
		suffix,
		uuid,
		prerelease = false,
		notes = "Local end-to-end demo release.",
	} of releases) {
		const asset = `${stem}-${tag}${suffix}`;
		const assetId = uuid ?? asset;
		const etag = `"${assetId}"`;
		assets.push(asset);
		const { body, signature } = await signedPayload({
			source: payload,
			name: asset,
			home,
		});

		const served = failMode === "signature" ? corrupted(body) : body;
		const advertised =
			failMode === "oversize"
				? served.byteLength - 1024
				: served.byteLength;

		const release = {
			tag_name: tag,
			draft: false,
			prerelease,
			body: notes,
			published_at: new Date(0).toISOString(),
			assets: [
				{
					name: asset,
					size: advertised,
					uuid: assetId,
					browser_download_url: `${origin}download/${asset}`,
				},
				...(failMode === "unsigned"
					? []
					: [
							{
								name: `${asset}.minisig`,
								size: signature.byteLength,
								uuid: `${assetId}-signature`,
								browser_download_url: `${origin}download/${asset}.minisig`,
							},
						]),
			],
		};

		const resumeFrom = (request: Request) => {
			const range = request.headers.get("range");
			const ifRange = request.headers.get("if-range");
			if (!range || (ifRange !== null && ifRange !== etag)) return null;
			const start = Number(/bytes=(\d+)-/.exec(range)?.[1]);
			return Number.isFinite(start) && start < served.byteLength
				? start
				: null;
		};

		indexes.set(repo, [
			...(indexes.get(repo) ?? []),
			{ release, prerelease },
		]);
		routes[`/download/${asset}`] = (request) => {
			note(request);
			const start = resumeFrom(request);
			const chunk = start === null ? served : served.subarray(start);
			return new Response(paced(chunk, { rate, failMode }), {
				status: start === null ? 200 : 206,
				headers: {
					ETag: etag,
					"Accept-Ranges": "bytes",
					"Content-Length": String(chunk.byteLength),
					...(start !== null && {
						"Content-Range": `bytes ${start}-${served.byteLength - 1}/${served.byteLength}`,
					}),
				},
			});
		};
		routes[`/download/${asset}.minisig`] = (request) => {
			note(request);
			return new Response(signature);
		};
	}

	for (const [repo, entries] of indexes) {
		routes[`/api/v1/repos/open-grind/${repo}/releases`] = (request) => {
			note(request);
			if (failMode === "server") {
				return new Response("upstream is unwell", { status: 500 });
			}
			const stableOnly =
				new URL(request.url).searchParams.get("pre-release") ===
				"false";
			return Response.json(
				entries
					.filter((entry) => !stableOnly || !entry.prerelease)
					.map((entry) => entry.release),
			);
		};
	}

	const server = Bun.serve({
		port,
		hostname: "127.0.0.1",
		routes,
		fetch: (request) => {
			note(request);
			return new Response("not found", { status: 404 });
		},
	});

	return { origin, publicKey, assets, stop: () => server.stop(true) };
}
