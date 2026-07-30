/**
 * Shared geometry for a field row inside a settings group card. Exported as a
 * string rather than wrapped in a component so controls that need to *be* the
 * row — a dropdown trigger, for instance, where tapping anywhere should open the
 * menu — can adopt the same layout without nesting an extra element.
 */
export const inlineRowClass =
	"flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start transition-colors";

export const stackedRowClass = "flex w-full flex-col gap-2 px-4 py-3.5";

/** Label of an inline row: the primary text, mirroring a settings row title. */
export const inlineLabelClass =
	"min-w-0 shrink-0 font-heading text-body font-medium";

/** Label above a stacked control, which reads as a caption for it. */
export const stackedLabelClass =
	"px-0 text-caption font-medium text-muted-foreground";

/** Value text on the trailing edge of an inline row. */
export const valueClass = "min-w-0 truncate text-body";

/**
 * Text input that sits directly in a row with no box of its own, so the row
 * reads as "Label ......... value" the way native settings forms do.
 */
export const bareInputClass =
	"h-auto rounded-md border-0 bg-transparent px-1 py-1 text-body text-end";
