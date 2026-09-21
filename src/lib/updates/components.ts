export const APP_COMPONENT = "app";
export const GOOGLE_OAUTH_COMPONENT = "google-oauth";
export const RECAPTCHA_COMPONENT = "recaptcha";

export const COMPONENT_PACKAGE = {
	[APP_COMPONENT]: "org.regrind",
	[GOOGLE_OAUTH_COMPONENT]: "org.opengrind.google_oauth",
	[RECAPTCHA_COMPONENT]: "org.opengrind.recaptcha",
} as const;
export type ComponentKey =
	| typeof APP_COMPONENT
	| typeof GOOGLE_OAUTH_COMPONENT
	| typeof RECAPTCHA_COMPONENT;
export type AddonKey = Exclude<ComponentKey, typeof APP_COMPONENT>;

export const ADDON_NAME: Record<AddonKey, string> = {
	[GOOGLE_OAUTH_COMPONENT]: "Google OAuth app",
	[RECAPTCHA_COMPONENT]: "reCAPTCHA helper",
};
