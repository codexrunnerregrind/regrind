export function isPlayBuild(): boolean {
	return import.meta.env.OPEN_GRIND_STORE === "play";
}
