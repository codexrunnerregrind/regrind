import { toast } from "svelte-sonner";

/**
 * Says out loud that what just opened is the paywall teaser, not the album.
 *
 * A locked or expired album has no content we are entitled to, but it still
 * appears in the "unlock albums" upsell with downscaled, blurred previews. We
 * show those rather than a dead tile — the same thing the official app's
 * paywall shows. The full-resolution originals live behind a per-file CDN
 * signature the app only issues to entitled viewers, so there is nothing
 * sharper to fetch; this toast keeps that honest instead of passing a blurred
 * preview off as the album.
 */
export function announcePaywallTeaser(): void {
	toast.info("Preview only — this album is locked", {
		description: "These are the blurred previews shown on the paywall.",
	});
}
