import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type scale in layout.css (§ Typography) adds font sizes tailwind-merge
// doesn't know about, and it falls back to reading `text-bubble` as a text
// *color* — so a component that merged a size with a color silently dropped
// the size. Register the custom names so both survive.
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-size": [
				{
					text: [
						"2xs",
						"3xs",
						"screen-title",
						"section",
						"row",
						"bubble",
						"preview",
						"meta",
						"distance",
						"caption",
						"detail",
						"album-name",
						"body",
						"title",
					],
				},
			],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export type WithoutChild<T> = T extends { child?: unknown }
	? Omit<T, "child">
	: T;
export type WithoutChildren<T> = T extends { children?: unknown }
	? Omit<T, "children">
	: T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};
