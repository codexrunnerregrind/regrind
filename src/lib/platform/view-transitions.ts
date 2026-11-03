import type { Navigation } from "@sveltejs/kit";

export const TRANSITION_NAME_QUERY_PARAM = "transitionName";

export const TRANSITION_PROFILE_THUMB_QUERY_PARAM = "profileThumbHash";

export const appendProfileTransitionQueryParam = (
	href: string,
	transitionName: string | null,
	thumbMediaHash?: string | null,
) => {
	if (!thumbMediaHash || !transitionName) return href;
	const [path, query] = href.split("?");
	const searchParams = new URLSearchParams(query);

	searchParams.append(
		TRANSITION_NAME_QUERY_PARAM,
		getProfileTransitionName(transitionName, thumbMediaHash) ?? "",
	);
	searchParams.append(TRANSITION_PROFILE_THUMB_QUERY_PARAM, thumbMediaHash);

	return `${path}?${searchParams.toString()}`;
};

export const getProfileTransitionName = (
	transitionName: string,
	thumbMediaHash?: string | null,
) => {
	if (!thumbMediaHash) return;
	return `${transitionName}-${thumbMediaHash}`;
};

export const viewTransition = (navigation: Navigation) => {
	if (!document.startViewTransition) return;

	const fromSearch = navigation.from?.url.search ?? "";
	const toSearch = navigation.to?.url.search ?? "";

	const shouldTransition =
		toSearch.includes(TRANSITION_NAME_QUERY_PARAM + "=") ||
		fromSearch.includes(TRANSITION_NAME_QUERY_PARAM + "=");

	if (!shouldTransition) return;

	return new Promise<void>((resolve) => {
		document.startViewTransition(async () => {
			resolve();
			await navigation.complete;
		});
	});
};
