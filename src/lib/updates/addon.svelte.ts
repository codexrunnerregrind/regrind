import { isAndroidPlatform } from "$lib/platform/os";
import { buildSignedByOpenGrind } from "./capability.svelte";
import { GOOGLE_OAUTH_COMPONENT } from "./components";
import { type StagePresenter, UpdateFlow } from "./flow";
import { getUpdateReadiness, updatesAvailableHere } from "./index";
import type { UpdateStage } from "./stage";
import { toastPresenter } from "./toast-presenter";

export function addonInstallerAvailable(): boolean {
	return (
		updatesAvailableHere() &&
		isAndroidPlatform() &&
		buildSignedByOpenGrind()
	);
}

export async function addonPublishedHere(): Promise<boolean> {
	const readiness = await getUpdateReadiness(GOOGLE_OAUTH_COMPONENT).catch(
		() => null,
	);
	return !(
		readiness?.state === "unsupported" &&
		readiness.detail.reason === "noReleaseArtifacts"
	);
}

const activity = $state<{ stage: UpdateStage | null; installs: number }>({
	stage: null,
	installs: 0,
});

export const addonActivity = {
	get stage(): UpdateStage | null {
		return activity.stage;
	},
	get installs(): number {
		return activity.installs;
	},
};

function observed(presenter: StagePresenter): StagePresenter {
	let showing = 0;
	return {
		show: (args) => {
			const shown = ++showing;
			activity.stage = args.view.stage;
			presenter.show({
				...args,
				onDismiss: () => {
					if (shown === showing) activity.stage = null;
					args.onDismiss();
				},
			});
		},
		dismiss: () => {
			showing++;
			activity.stage = null;
			presenter.dismiss();
		},
		problem: (title) => presenter.problem(title),
		manualInstall: (body) => presenter.manualInstall(body),
		installed: (args) => {
			activity.installs++;
			presenter.installed(args);
		},
		upToDate: () => presenter.upToDate(),
	};
}

export const addonUpdates = new UpdateFlow({
	component: GOOGLE_OAUTH_COMPONENT,
	presenter: observed(toastPresenter(GOOGLE_OAUTH_COMPONENT)),
});

export async function startAddonUpdateWatch(): Promise<void> {
	if (!addonInstallerAvailable()) return;
	await addonUpdates.start();
}
