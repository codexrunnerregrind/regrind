import { ADDON_NAME, APP_COMPONENT, type ComponentKey } from "./components";
import type { Progress, Release, UpdateError } from "./types";

export type UpdateStage =
	| "available"
	| "downloading"
	| "verifying"
	| "paused"
	| "ready"
	| "installing";

export type StageView = { stage: UpdateStage; received: number; total: number };

export type StageChange =
	| { view: StageView }
	| { failed: UpdateError | undefined };

export function stageOf(progress: Progress): StageChange {
	const { received, total } = progress;
	switch (progress.phase) {
		case "downloading":
			return { view: { stage: "downloading", received, total } };
		case "verifying":
			return { view: { stage: "verifying", received: 0, total: 0 } };
		case "ready":
			return { view: { stage: "ready", received: total, total } };
		case "canceled":
			return { view: { stage: "paused", received, total } };
		case "failed":
			return { failed: progress.detail };
	}
}

const appTitles: Record<UpdateStage, string> = {
	available: "New update available",
	downloading: "Downloading update…",
	verifying: "Verifying the update…",
	paused: "Update is available",
	ready: "Update is downloaded",
	installing: "Installing…",
};

function addonTitles(
	name: string,
): Record<Release["kind"], Record<UpdateStage, string>> {
	return {
		install: {
			available: `${name} is available`,
			downloading: `Downloading the ${name}…`,
			verifying: `Verifying the ${name}…`,
			paused: `${name} is ready to download`,
			ready: `${name} is downloaded`,
			installing: `Installing the ${name}…`,
		},
		update: {
			available: `${name} update available`,
			downloading: `Downloading the ${name} update…`,
			verifying: `Verifying the ${name} update…`,
			paused: `${name} update is available`,
			ready: `${name} update is downloaded`,
			installing: `Updating the ${name}…`,
		},
	};
}

type StageCopyArgs = {
	component: ComponentKey;
	kind: Release["kind"];
	stage: UpdateStage;
};

export function stageTitle({ component, kind, stage }: StageCopyArgs): string {
	if (component === APP_COMPONENT) return appTitles[stage];
	return addonTitles(ADDON_NAME[component])[kind][stage];
}

const installBodies: Record<UpdateStage, string | undefined> = {
	available: "Tap to install, swipe to dismiss",
	downloading: undefined,
	verifying: undefined,
	paused: "Tap to download",
	ready: "Tap to install",
	installing: undefined,
};

const addonUpdateBodies: Record<UpdateStage, string | undefined> = {
	...installBodies,
	available: "Tap to update, swipe to dismiss",
	ready: "Tap to update",
};

export function stageBody({
	component,
	kind,
	stage,
}: StageCopyArgs): string | undefined {
	const updatesAddon = component !== APP_COMPONENT && kind === "update";
	return (updatesAddon ? addonUpdateBodies : installBodies)[stage];
}
