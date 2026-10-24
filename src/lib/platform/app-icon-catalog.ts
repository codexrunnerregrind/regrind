// Shared by the settings screen and scripts/gen-app-icons.ts. Every icon comes
// in every color; `weather-blue` names the iOS `AppIcon-Weather-Blue` set and
// the Android `.AppIconWeather_Blue` launcher alias.
export const appIconColors = [
	{ id: "blue", label: "Blue", top: "#62C1FF", bottom: "#1F6ADB" },
	{ id: "teal", label: "Teal", top: "#5BE0C8", bottom: "#139A8E" },
	{ id: "green", label: "Green", top: "#5EE68C", bottom: "#1DAA4F" },
	{ id: "purple", label: "Purple", top: "#9B86FF", bottom: "#5233E0" },
	{ id: "red", label: "Red", top: "#FF8A80", bottom: "#E5394F" },
	{ id: "orange", label: "Orange", top: "#FFD36B", bottom: "#FF9A1F" },
	{ id: "graphite", label: "Graphite", top: "#4B4B55", bottom: "#1B1B20" },
] as const;

export const appIcons = [
	{ id: "weather", label: "Weather", color: "blue" },
	{ id: "notes", label: "Notes", color: "orange" },
	{ id: "calculator", label: "Calculator", color: "graphite" },
	{ id: "camera", label: "Camera", color: "graphite" },
	{ id: "clock", label: "Clock", color: "purple" },
	{ id: "chat", label: "Chat", color: "green" },
	{ id: "photos", label: "Photos", color: "teal" },
] as const satisfies readonly {
	id: string;
	label: string;
	color: AppIconColor;
}[];

export type AppIconColor = (typeof appIconColors)[number]["id"];
export type AppIconGlyph = (typeof appIcons)[number]["id"];
export type AppIconId = `${AppIconGlyph}-${AppIconColor}`;

export function appIconId(glyph: AppIconGlyph, color: AppIconColor): AppIconId {
	return `${glyph}-${color}`;
}

export function parseAppIconId(
	id: string,
): { glyph: AppIconGlyph; color: AppIconColor } | null {
	const [glyph, color] = id.split("-");
	const known =
		appIcons.some((icon) => icon.id === glyph) &&
		appIconColors.some((option) => option.id === color);
	return known
		? { glyph: glyph as AppIconGlyph, color: color as AppIconColor }
		: null;
}

export const allAppIconIds: AppIconId[] = appIcons.flatMap(({ id }) =>
	appIconColors.map((color) => appIconId(id, color.id)),
);

const capitalize = (word: string) => word[0]!.toUpperCase() + word.slice(1);

export function iosAppIconName(id: AppIconId): string {
	return `AppIcon-${id.split("-").map(capitalize).join("-")}`;
}

export function androidAppIconAlias(id: AppIconId): string {
	return `AppIcon${id.split("-").map(capitalize).join("_")}`;
}
