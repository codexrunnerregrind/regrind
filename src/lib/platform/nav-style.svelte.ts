import { getNavBarGlassSnapshot } from "$lib/app-data/preferences.svelte";

/**
 * Whether the tab bar is the floating capsule rather than the docked bar.
 *
 * Lives on its own because more than the tab bar depends on the answer: anything
 * that sits directly on top of the bar (the profile composer) has to fill the
 * band the docked bar used to paint, now that the capsule floats over it
 * instead. Reading the snapshot keeps callers reactive to the preference.
 */
export function isFloatingNav(): boolean {
	return getNavBarGlassSnapshot();
}
