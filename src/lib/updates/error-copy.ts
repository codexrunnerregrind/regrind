import z from "zod";

import {
	ADDON_NAME,
	APP_COMPONENT,
	type ComponentKey,
	GOOGLE_OAUTH_COMPONENT,
	RECAPTCHA_COMPONENT,
} from "./components";
import {
	asUpdateError,
	type Release,
	type Unsupported,
	type UpdateError,
} from "./types";

const unsupportedCopy: Record<Unsupported["reason"], string> = {
	externallyManaged:
		"Updates are managed by the store that installed the app",
	foreignSigner: "This build was not signed by ReGrind",
	foreignTarget: "The installed app isn't signed by ReGrind",
	undetermined: "ReGrind can't tell whether it may update itself",
	noReleaseArtifacts: "No release is published for this platform",
	sandboxed: "The sandbox this app runs in manages its own updates",
	locationNotWritable: "ReGrind can't install the update in its directory",
};

const userCanFix: Record<Unsupported["reason"], boolean> = {
	externallyManaged: false,
	foreignSigner: false,
	foreignTarget: true,
	undetermined: true,
	noReleaseArtifacts: false,
	sandboxed: false,
	locationNotWritable: true,
};

export function unsupportedIsFixable(detail: Unsupported): boolean {
	return userCanFix[detail.reason];
}

type KnownKind = Exclude<UpdateError["kind"], "unsupported">;

const copy: Record<KnownKind, string> = {
	network: "Couldn't reach the release server",
	server: "The release server refused the request",
	malformedIndex: "The release server sent something unreadable",
	noArtifact: "The release has no download for this platform",
	unsigned: "Failed to verify the update",
	foreignUrl: "The release points somewhere outside the release server",
	signature: "Failed to verify the update",
	storage: "Couldn't write the update to storage",
	oversize: "The download was larger than the release said",
	assetReplaced: "The release changed during the download. Try again.",
	canceled: "Update canceled",
	nothingStaged: "No update is ready to install",
	needsUnknownSources: "ReGrind needs permission to install updates",
	needsManualInstall: "Quit ReGrind, then drag it onto Applications",
	install: "Couldn't install the update",
	checkTooSoon: "Already checked for updates recently",
	autoChecksDisabled: "Automatic update checks are turned off",
	unknownComponent: "ReGrind doesn't know that component",
	busy: "Another download is already running",
};

function addonUnsupportedCopy(
	name: string,
): Partial<Record<Unsupported["reason"], string>> {
	return {
		externallyManaged: `The store that installed the ${name} manages its updates`,
		foreignSigner: `This copy of ReGrind isn't signed by Open Grind, so it can't install the ${name}`,
		foreignTarget: `The installed ${name} isn't signed by Open Grind. Uninstall it to install the official one.`,
		noReleaseArtifacts: `The ${name} isn't published for this device`,
		undetermined: `ReGrind can't tell whether it may install the ${name}`,
	};
}

function addonCopy(name: string): Partial<Record<KnownKind, string>> {
	return {
		unsigned: `Failed to verify the ${name}`,
		signature: `Failed to verify the ${name}`,
		storage: `Couldn't save the ${name} download`,
		install: `Couldn't install the ${name}`,
	};
}

function addonUpdateCopy(name: string): Partial<Record<KnownKind, string>> {
	return { install: `Couldn't update the ${name}` };
}

const busyCopy: Record<ComponentKey, string> = {
	[APP_COMPONENT]: "Wait for the ReGrind update to finish downloading",
	[GOOGLE_OAUTH_COMPONENT]:
		"Wait for the Google OAuth app to finish downloading",
	[RECAPTCHA_COMPONENT]:
		"Wait for the reCAPTCHA helper to finish downloading",
};

const busyDetailSchema = z.object({
	component: z.enum([
		APP_COMPONENT,
		GOOGLE_OAUTH_COMPONENT,
		RECAPTCHA_COMPONENT,
	]),
});

const PACKAGE_MANAGER_INSTALL_FAILED_INSUFFICIENT_STORAGE = -4;

const APP_NO_STORAGE = "Not enough storage to install the update";

function addonNoStorageCopy(name: string): Record<Release["kind"], string> {
	return {
		install: `Not enough storage to install the ${name}`,
		update: `Not enough storage to update the ${name}`,
	};
}

export function unsupportedText(
	{ reason }: Unsupported | Pick<Unsupported, "reason">,
	{ component = APP_COMPONENT }: { component?: ComponentKey } = {},
): string {
	const addonText =
		component === APP_COMPONENT
			? undefined
			: addonUnsupportedCopy(ADDON_NAME[component])[reason];
	return addonText ?? unsupportedCopy[reason];
}

export function noReleaseText({
	component,
}: {
	component: ComponentKey;
}): string {
	return component === APP_COMPONENT
		? "No ReGrind release is published yet"
		: `No ${ADDON_NAME[component]} release is published yet`;
}

export function updateErrorText(
	error: unknown,
	{
		fallback,
		component = APP_COMPONENT,
		kind = "install",
	}: { fallback: string; component?: ComponentKey; kind?: Release["kind"] },
): string {
	const known = asUpdateError(error);
	if (!known) return fallback;
	if (known.kind === "unsupported") {
		return unsupportedText(known.detail, { component });
	}
	if (known.kind === "busy") {
		const running = busyDetailSchema.safeParse(known.detail);
		return running.success ? busyCopy[running.data.component] : copy.busy;
	}
	if (component === APP_COMPONENT) return copy[known.kind];
	const name = ADDON_NAME[component];
	const updateText =
		kind === "update" ? addonUpdateCopy(name)[known.kind] : undefined;
	return updateText ?? addonCopy(name)[known.kind] ?? copy[known.kind];
}

export function installFailedText({
	code,
	component,
	kind,
}: {
	code?: number | null;
	component: ComponentKey;
	kind: Release["kind"];
}): string {
	if (code === PACKAGE_MANAGER_INSTALL_FAILED_INSUFFICIENT_STORAGE) {
		return component === APP_COMPONENT
			? APP_NO_STORAGE
			: addonNoStorageCopy(ADDON_NAME[component])[kind];
	}
	return updateErrorText(
		{ kind: "install" },
		{ fallback: copy.install, component, kind },
	);
}

export function problemBody({
	component,
	title,
}: {
	component: ComponentKey;
	title: string;
}): string | undefined {
	if (component === APP_COMPONENT) return undefined;
	const name = ADDON_NAME[component];
	return title.toLowerCase().includes(name.toLowerCase()) ? undefined : name;
}
