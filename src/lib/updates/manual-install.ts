import { isPlayBuild } from "$lib/platform/store";
import { COMPONENT_REPO, GOOGLE_OAUTH_COMPONENT } from "./components";

const MANUAL_INSTALL = {
	[GOOGLE_OAUTH_COMPONENT]: {
		releases: `${COMPONENT_REPO[GOOGLE_OAUTH_COMPONENT]}/releases#install`,
		guide: "https://opengrind.org/guides/sign-in-with-google#installed-from-google-play",
	},
} as const;

export function manualInstallHref(addon: keyof typeof MANUAL_INSTALL): string {
	const { releases, guide } = MANUAL_INSTALL[addon];
	return isPlayBuild() ? guide : releases;
}
