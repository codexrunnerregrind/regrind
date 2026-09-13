export const APP_COMPONENT = "app";
export const GOOGLE_OAUTH_COMPONENT = "google-oauth";

export const COMPONENT_PACKAGE = {
	[APP_COMPONENT]: "org.regrind",
	[GOOGLE_OAUTH_COMPONENT]: "org.opengrind.google_oauth",
} as const;
export type ComponentKey = typeof APP_COMPONENT | typeof GOOGLE_OAUTH_COMPONENT;
