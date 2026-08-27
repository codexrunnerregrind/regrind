<script lang="ts">
	import { goto } from "$app/navigation";
	import ChatIcon from "phosphor-svelte/lib/ChatIcon";
	import DownloadSimpleIcon from "phosphor-svelte/lib/DownloadSimpleIcon";
	import FireIcon from "phosphor-svelte/lib/FireIcon";
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";
	import MagnifyingGlassPlusIcon from "phosphor-svelte/lib/MagnifyingGlassPlusIcon";
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";
	import UserIcon from "phosphor-svelte/lib/UserIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";
	import type PhotoSwipe from "photoswipe";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getProfile } from "$lib/api/users/profiles";
	import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
	import {
		chromeHasBar,
		type MediaViewerActions,
		type MediaViewerHeader,
	} from "$lib/chat/media-viewer-chrome";
	import { hapticImpact, hapticNotification } from "$lib/platform/haptics";
	import { HoldGesture } from "$lib/util/hold-gesture.svelte";
	import { profileMediaUrl } from "$lib/util/media";
	import { formatDistance } from "$lib/util/units";

	let {
		pswp,
		count,
		header: headerProp,
		actions,
		progress = true,
	}: {
		pswp: PhotoSwipe;
		count: number;
		header: MediaViewerHeader | ((index: number) => MediaViewerHeader);
		actions: MediaViewerActions;
		progress?: boolean;
	} = $props();

	// A dozen segments is about where they stop being distinguishable on a phone;
	// past that a single filling bar reads better.
	const MAX_SEGMENTS = 12;

	let index = $state(0);
	let draft = $state("");
	let sending = $state(false);
	let reacting = $state(false);
	// Confirmation lives in the viewer rather than in a toast: a bottom-centered
	// toast lands right on top of the reply bar it is confirming.
	let sentLabel = $state<string | null>(null);
	let sentTimer: ReturnType<typeof setTimeout> | undefined;
	let savingAll = $state(false);

	const hasBar = $derived(chromeHasBar(actions));
	// Once there is something to send, the bar becomes the chat composer's: the
	// tap and chat buttons give up their place to a single send button beside
	// the field, and give it their width back when the draft is cleared.
	const composing = $derived(draft.trim() !== "");

	// 44pt control plus the 10pt that separates it from the field. The trailing
	// box is exactly as wide as whatever is currently in it, so the field takes
	// the rest of the row.
	const SLOT = 54;
	const restSlots = $derived(
		(actions.onReact === undefined ? 0 : 1) +
			(actions.onOpenChat === undefined ? 0 : 1),
	);
	const trailingWidth = $derived(
		composing && actions.onReply !== undefined ? SLOT : restSlots * SLOT,
	);
	// The field is there whenever the bar is, working or not: a locked album's
	// previews keep it greyed out and saying why, which reads as "not here" far
	// better than a bar with a hole in it.
	const replyPlaceholder = $derived(
		actions.onReply === undefined
			? actions.replyUnavailable
			: "Reply to this...",
	);
	// Fire gives up the end position to chat when both are there.
	const fireEnd = $derived(actions.onOpenChat === undefined ? 0 : SLOT);
	const header = $derived(
		typeof headerProp === "function" ? headerProp(index) : headerProp,
	);

	// The feeds carry a name and thumbnail of varying freshness (and sometimes
	// none at all), so the real profile is fetched and preferred once it lands.
	// `getProfile` is cached, so reopening a viewer costs nothing.
	let fetched = $state<{
		profileId: number;
		profile: Awaited<ReturnType<typeof getProfile>>;
	} | null>(null);
	// Keyed by id so a slide belonging to somebody else never shows the previous
	// slide's profile while its own is still in flight.
	const profile = $derived(
		fetched !== null && fetched.profileId === header.profileId
			? fetched.profile
			: null,
	);
	$effect(() => {
		const profileId = header.profileId;
		if (profileId === null || profileId === undefined) return;
		let canceled = false;
		getProfile(profileId)
			.then((profile) => {
				if (!canceled) fetched = { profileId, profile };
			})
			.catch((error) => {
				// The header still has the caller's values to fall back on, so a
				// profile we can't read (blocked, gone) isn't worth a toast.
				console.error(error);
			});
		return () => {
			canceled = true;
		};
	});

	const displayName = $derived(
		profile?.displayName?.trim() ||
			header.name?.trim() ||
			header.fallbackName,
	);
	const avatarUrl = $derived(
		profile?.profileImageMediaHash
			? profileMediaUrl({
					mediaHash: profile.profileImageMediaHash,
					size: "thumb",
				})
			: header.avatarUrl,
	);
	// The profile reports metres, the header prop kilometres.
	const distanceMetres = $derived(
		profile?.distance ??
			(header.distanceKm === null || header.distanceKm === undefined
				? null
				: header.distanceKm * 1000),
	);
	const distanceLabel = $derived(
		distanceMetres === null
			? null
			: `${formatDistance(distanceMetres, getUnitsSnapshot())} away`,
	);

	const linksToProfile = $derived(
		header.profileId !== null && header.profileId !== undefined,
	);

	function openProfile() {
		const profileId = header.profileId;
		if (profileId === null || profileId === undefined) return;
		hapticImpact("light");
		// Closing first: the lightbox is a body-level overlay, so it would sit on
		// top of the profile we're navigating to.
		pswp.close();
		void goto(`/profile/${profileId}`);
	}

	function flashSent(label: string) {
		sentLabel = label;
		clearTimeout(sentTimer);
		sentTimer = setTimeout(() => (sentLabel = null), 2000);
	}

	$effect(() => () => clearTimeout(sentTimer));

	$effect(() => {
		const onChange = () => {
			index = pswp.currIndex;
		};
		onChange();
		pswp.on("change", onChange);
		return () => pswp.off("change", onChange);
	});

	async function sendReply(event: SubmitEvent) {
		event.preventDefault();
		const reply = draft.trim();
		const send = actions.onReply;
		if (reply === "" || sending || send === undefined) return;
		sending = true;
		try {
			await send(reply, index);
			draft = "";
			hapticNotification("success");
			flashSent("Reply sent");
		} catch (error) {
			hapticNotification("error");
			showErrorToast({ label: "Failed to send reply", error });
		} finally {
			sending = false;
		}
	}

	async function react() {
		const send = actions.onReact;
		if (reacting || send === undefined) return;
		reacting = true;
		hapticImpact("medium");
		try {
			await send(index);
			flashSent("Sent 🔥");
		} catch (error) {
			hapticNotification("error");
			showErrorToast({ label: "Failed to react", error });
		} finally {
			reacting = false;
		}
	}

	function openChat() {
		hapticImpact("light");
		void actions.onOpenChat?.();
	}

	// Zoom, save and close: the three actions the handoff puts in the sender row,
	// replacing PhotoSwipe's own toolbar (hidden by `.pswp--chrome`). Zoom and
	// close are the lightbox's own; only saving is the caller's to resolve, since
	// only the caller knows what the slide is.
	function zoom() {
		hapticImpact("light");
		pswp.toggleZoom();
	}

	// Hold saves the album, tap saves the photo.
	const hold = new HoldGesture({
		run: () => void saveAll(),
		enabled: () => actions.onSaveAll !== undefined && !savingAll,
	});
	$effect(() => () => hold.dispose());

	function save() {
		if (hold.claimedClick()) return;
		hapticImpact("light");
		void actions.onSave?.(index);
	}

	async function saveAll() {
		const saveEverything = actions.onSaveAll;
		if (savingAll || saveEverything === undefined) return;
		savingAll = true;
		try {
			await saveEverything();
		} finally {
			savingAll = false;
		}
	}

	function close() {
		hapticImpact("light");
		pswp.close();
	}

	// PhotoSwipe binds its own pointer and key handlers on the root this is
	// mounted into, both of which would swallow interaction with the reply bar: a
	// drag over the field pans the photo, and arrow keys or Escape typed into it
	// move between slides (see the keydown guard in media-viewer-chrome.ts).
	function stopPointer(event: PointerEvent) {
		event.stopPropagation();
	}
</script>

{#snippet identity()}
	<!-- Centring the fallback glyph needs the flexbox: `margin: auto` alone
	     centers it horizontally and leaves it sitting against the top. -->
	<div
		class="flex size-9.5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-viewer-chip"
	>
		{#if avatarUrl}
			<img
				src={avatarUrl}
				alt=""
				class="size-full object-cover"
				draggable="false"
			/>
		{:else if linksToProfile}
			<UserIcon weight="fill" class="size-5 text-viewer-ink3" />
		{:else}
			<!-- Nobody's avatar to miss: an album of our own is identified by its
			     name, so a person glyph beside it reads as a missing photo. -->
			<ImagesIcon weight="fill" class="size-5 text-viewer-ink3" />
		{/if}
	</div>
	<div class="viewer-label flex min-w-0 flex-col">
		<!-- Emoji overshoot the tight line box `truncate` clips to, so a name
		     ending in one loses its bottom. The padding moves the clip edge off
		     the glyphs; the matching negative margin keeps the row's height and
		     the gap down to the subtitle unchanged. -->
		<span
			class="-my-[0.25em] truncate py-[0.25em] text-body leading-none font-semibold text-viewer-ink"
		>
			{displayName}
		</span>
		<span class="mt-2 truncate text-preview leading-none text-viewer-ink2">
			{#if distanceLabel}
				{distanceLabel}
			{:else if header.subtitle}
				{header.subtitle}
			{:else if progress}
				<!-- Only where the slides are one set: a count across a feed of
				     different people's posts says nothing. -->
				{count}
				{count === 1 ? "item" : "items"}
			{/if}
		</span>
	</div>
{/snippet}

<!-- The bars, not this container, carry pswp__hide-on-close: that class comes
     with `pointer-events: auto` once the lightbox is open, which on a full-screen
     container would swallow every tap meant for the photo or the toolbar. -->
<div
	class="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between"
	data-media-chrome
>
	<!-- Floats over the photo, which fills the screen: the bar is a scrim, and the
	     glyphs on it carry their own shadow (see `.viewer-glyph`). Stays
	     click-through as a whole so a tap anywhere it isn't covering a control
	     still reaches the photo. -->
	<header
		class="pswp__hide-on-close pointer-events-none! bg-linear-to-b from-black/70 to-transparent pt-(--safe-area-top) pb-4"
	>
		<!-- Kept in the layout even with nothing to show — a single photo, or a feed
		     whose slides aren't one set — so the name and avatar below sit at the
		     same height in every viewer. h-[19px] is the band's own height under
		     border-box: 6pt above the 3pt bars, 10pt below.
		     Each segment is one fixed size at every count, so two photos and eight
		     look alike and the row simply grows; stretching segments to the page
		     width reads as a loading bar rather than as your place in a set. The
		     width is the one that still fits MAX_SEGMENTS inside the cap, so the
		     row never has to shrink its segments to stay within it. -->
		<div
			class="mx-auto flex h-[19px] max-w-64 items-center justify-center gap-1.5 pt-1.5 pb-2.5"
			aria-hidden="true"
		>
			{#if progress && count > 1}
				{#if count <= MAX_SEGMENTS}
					{#each { length: count }, i}
						<span
							class={[
								"h-[3px] w-[15px] shrink-0 rounded-sm transition-colors",
								{
									"bg-viewer-ink": i === index,
									"bg-viewer-ink/30": i !== index,
								},
							]}
						></span>
					{/each}
				{:else}
					<span class="h-[3px] w-32 rounded-sm bg-viewer-ink/30">
						<span
							class="block h-full rounded-sm bg-viewer-ink transition-[width]"
							style:width="{((index + 1) / count) * 100}%"
						></span>
					</span>
				{/if}
			{/if}
		</div>
		<!-- Whose media this is, then the viewer's three actions. These replace
		     PhotoSwipe's own toolbar, which `.pswp--chrome` hides — it drew the same
		     three as floating discs over the photo and would now land on this row.
		     Bare 20pt line glyphs rather than discs, as the handoff draws them; over
		     a full-bleed photo they lean on a shadow to stay legible, the same way
		     the tile overlays do. -->
		<div class="flex items-center gap-3 px-screen">
			{#if linksToProfile}
				<button
					type="button"
					onclick={openProfile}
					onpointerdown={stopPointer}
					aria-label="Open {displayName}'s profile"
					class="pointer-events-auto flex min-w-0 flex-1 items-center gap-3 rounded-full text-start transition-opacity active:opacity-70"
				>
					{@render identity()}
				</button>
			{:else}
				<div class="flex min-w-0 flex-1 items-center gap-3">
					{@render identity()}
				</div>
			{/if}
			<!-- Each glyph is padded out to the 44pt minimum target; they keep the
			     handoff's 16pt rhythm (gap-1 plus the padding either side of each),
			     and the row is pulled out to the screen padding so the last one's
			     surplus doesn't read as a wider margin. -->
			<div
				class="viewer-glyphs -me-3 flex shrink-0 items-center gap-1 text-viewer-ink"
			>
				<button
					type="button"
					onclick={zoom}
					onpointerdown={stopPointer}
					aria-label="Zoom"
					class="pointer-events-auto flex size-11 items-center justify-center transition-opacity active:opacity-60"
				>
					<MagnifyingGlassPlusIcon class="size-5" />
				</button>
				{#if actions.onSave !== undefined}
					<button
						type="button"
						onclick={save}
						onpointerdown={(event) => {
							stopPointer(event);
							hold.start();
						}}
						onpointerup={() => hold.end()}
						onpointercancel={() => hold.cancel()}
						onpointerleave={() => hold.cancel()}
						oncontextmenu={(event) => event.preventDefault()}
						aria-busy={savingAll}
						aria-label={actions.onSaveAll === undefined
							? "Save to your device"
							: "Save to your device — hold to save all"}
						class={[
							"pointer-events-auto flex size-11 touch-none items-center justify-center transition-[opacity,transform] select-none active:opacity-60 aria-busy:opacity-60",
							{ "scale-125": hold.holding },
						]}
					>
						<DownloadSimpleIcon class="size-5" />
					</button>
				{/if}
				<button
					type="button"
					onclick={close}
					onpointerdown={stopPointer}
					aria-label="Close"
					class="pointer-events-auto flex size-11 items-center justify-center transition-opacity active:opacity-60"
				>
					<XIcon class="size-5" />
				</button>
			</div>
		</div>
	</header>

	{#if hasBar}
		<!-- The reply bar: a pill field and two round buttons on the viewer's own
		     chip fill, matching the composers elsewhere in the app. Floats over the
		     photo on a scrim, so the controls carry their own fill (blurred, since
		     what's behind them is the photo rather than a bar). -->
		<form
			class="pswp__hide-on-close pointer-events-auto relative flex items-center bg-linear-to-t from-black/70 to-transparent px-screen pt-6 pb-[calc(26px+var(--safe-area-bottom,0px))]"
			onpointerdown={stopPointer}
			onsubmit={sendReply}
		>
			{#if sentLabel !== null}
				<!-- Absolute so it never changes the bar's height, which is what the
				     lightbox pads the media by. -->
				<div
					class="pointer-events-none absolute inset-x-0 -top-2 flex justify-center"
					aria-live="polite"
				>
					<span
						class="rounded-full bg-viewer-chip/80 px-3 py-1 text-2xs font-medium text-viewer-ink backdrop-blur-md"
					>
						{sentLabel}
					</span>
				</div>
			{/if}
			{#if replyPlaceholder !== undefined}
				<div class="relative min-w-0 flex-1">
					<input
						type="text"
						bind:value={draft}
						disabled={sending || actions.onReply === undefined}
						enterkeyhint="send"
						placeholder={replyPlaceholder}
						aria-label="Reply to this photo"
						onkeydown={(event) => {
							// Explicit rather than relying on implicit submission: PhotoSwipe
							// handles keys on the root this field is mounted into.
							if (event.key !== "Enter") return;
							event.preventDefault();
							event.currentTarget.form?.requestSubmit();
						}}
						class="h-11 w-full rounded-composer bg-viewer-chip/80 px-4.5 text-sm text-viewer-ink backdrop-blur-md outline-none placeholder:text-viewer-ink3 focus-visible:ring-2 focus-visible:ring-viewer-ink/40 disabled:opacity-60"
					/>
				</div>
			{:else}
				<div class="flex-1"></div>
			{/if}
			<!-- The trailing controls are pinned to the bar's end rather than laid
			     out in the row, so swapping them moves nothing sideways: each one
			     simply fades where it stands, and send comes up in the place the
			     chat button just left. Only this box's width animates, which is
			     what lets the flexed field grow into the space smoothly. -->
			<div
				class="relative h-11 shrink-0 transition-[width] duration-200 ease-out"
				style:width="{trailingWidth}px"
			>
				{#if actions.onReact !== undefined}
					<button
						type="button"
						onclick={react}
						disabled={reacting}
						inert={composing}
						style:inset-inline-end="{fireEnd}px"
						class={[
							"absolute top-0 flex size-11 items-center justify-center rounded-full bg-viewer-chip/80 text-viewer-ink backdrop-blur-md transition-[opacity,transform] duration-200 ease-out active:scale-90 disabled:opacity-60",
							{ "opacity-0": composing },
						]}
						aria-label="React with fire"
					>
						<!-- A line glyph, not the emoji the chat reactions use: this is one of
						     the viewer's controls, and a color illustration among line icons
						     reads as content rather than as a button. -->
						<FireIcon class="size-5" />
					</button>
				{/if}
				{#if actions.onOpenChat !== undefined}
					<button
						type="button"
						onclick={openChat}
						inert={composing}
						class={[
							"absolute end-0 top-0 flex size-11 items-center justify-center rounded-full bg-viewer-chip/80 text-viewer-ink backdrop-blur-md transition-[opacity,transform] duration-200 ease-out active:scale-90",
							{ "opacity-0": composing },
						]}
						aria-label="Open chat"
					>
						<ChatIcon class="size-5" />
					</button>
				{/if}
				{#if actions.onReply !== undefined}
					<button
						type="submit"
						disabled={sending}
						inert={!composing}
						class={[
							"absolute end-0 top-0 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,transform] duration-200 ease-out active:scale-90 disabled:opacity-60",
							{ "opacity-0": !composing },
						]}
						aria-label="Send reply"
					>
						<PaperPlaneRightIcon weight="fill" class="size-5" />
					</button>
				{/if}
			</div>
		</form>
	{/if}
</div>

<style lang="postcss">
	@reference "$layout";

	/* The header sits on a scrim over a full-bleed photo, which a bright sky can
	   still swallow. Same remedy as the tile overlays: a shadow on the text and
	   glyphs rather than a heavier fill, so more of the photo shows through.
	   One tight drop only, matching `.profile-card-distance`: a wide ambient
	   glow behind a short line of text reads as a gray box around it rather
	   than as depth. */
	.viewer-label {
		text-shadow: 0 1px 3px rgb(0 0 0 / 0.6);
	}

	.viewer-glyphs :global(svg) {
		filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.75));
	}
</style>
