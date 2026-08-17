/**
 * One "on" look for every filter row in the app — the grid's quick filters and
 * the inbox's alike. Whichever control carries it (a sheet-opening button, a
 * toggle button, a toggle-group item), an active filter is the inverted fill.
 */
export const ACTIVE_FILTER =
	"bg-foreground text-background hover:bg-foreground/90 hover:text-background";

/**
 * The same look for a control that reports itself through `aria-pressed`, which
 * also has to beat a toggle group's own default pressed fill.
 */
export const ACTIVE_FILTER_PRESSED =
	"aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground/90 aria-pressed:hover:text-background";
