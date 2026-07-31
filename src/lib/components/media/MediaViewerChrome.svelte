<script lang="ts">
	import { goto } from "$app/navigation";
	import ChatCircleIcon from "phosphor-svelte/lib/ChatCircleIcon";
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";
	import UserIcon from "phosphor-svelte/lib/UserIcon";
	import type PhotoSwipe from "photoswipe";

	import { showErrorToast } from "$lib/api/error";
	import { getProfile } from "$lib/api/users/profiles";
	import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
	import fireEmoji from "$lib/assets/emojis/fire/32px.png";
	import { hapticImpact, hapticNotification } from "$lib/platform/haptics";
	import { profileMediaUrl } from "$lib/util/media";
	import { formatDistance } from "$lib/util/units";
	import type {
		MediaViewerActions,
		MediaViewerHeader,
	} from "$lib/chat/media-viewer-chrome";

	let {
		pswp,
		count,
		header: headerProp,
		actions,
		progress = true,
		onInsets,
	}: {
		pswp: PhotoSwipe;
		count: number;
		header: MediaViewerHeader | ((index: number) => MediaViewerHeader);
		actions: MediaViewerActions;
		progress?: boolean;
		// Reports the measured heights of the two bars so the lightbox can keep
		// the media clear of them.
		onInsets?: (insets: { top: number; bottom: number }) => void;
	} = $props();

	// A dozen segments is about where they stop being distinguishable on a phone;
	// past that a single filling bar reads better.
	const MAX_SEGMENTS = 12;

	let index = $state(0);
	let draft = $state("");
	let sending = $state(false);
	let reacting = $state(false);
	let topBar = $state<HTMLElement | null>(null);
	let bottomBar = $state<HTMLElement | null>(null);
	// Confirmation lives in the viewer rather than in a toast: a bottom-centred
	// toast lands right on top of the reply bar it is confirming.
	let sentLabel = $state<string | null>(null);
	let sentTimer: ReturnType<typeof setTimeout> | undefined;

	const hasBar = $derived(
		actions.onReply !== undefined ||
			actions.onReact !== undefined ||
			actions.onOpenChat !== undefined,
	);
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
		profile?.displayName?.trim() || header.name?.trim() || header.fallbackName,
	);
	const avatarUrl = $derived(
		profile?.profileImageMediaHash
			? profileMediaUrl(profile.profileImageMediaHash, "thumb")
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

	// The bars are as tall as their content (a wrapped name, a bigger system font),
	// so they're measured rather than assumed.
	$effect(() => {
		if (!topBar || !onInsets) return;
		const report = () => {
			if (!topBar) return;
			onInsets({
				top: topBar.offsetHeight,
				// Mirrored when there's no bar: padding at the top alone would centre
				// the media in the space below the header, leaving it visibly low.
				bottom: bottomBar?.offsetHeight ?? topBar.offsetHeight,
			});
		};
		report();
		const observer = new ResizeObserver(report);
		observer.observe(topBar);
		if (bottomBar) observer.observe(bottomBar);
		return () => observer.disconnect();
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
	     centres it horizontally and leaves it sitting against the top. -->
	<div
		class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 backdrop-blur-md"
	>
		{#if avatarUrl}
			<img
				src={avatarUrl}
				alt=""
				class="size-full object-cover"
				draggable="false"
			/>
		{:else if linksToProfile}
			<UserIcon weight="fill" class="size-5 text-white/70" />
		{:else}
			<!-- Nobody's avatar to miss: an album of our own is identified by its
			     name, so a person glyph beside it reads as a missing photo. -->
			<ImagesIcon weight="fill" class="size-5 text-white/70" />
		{/if}
	</div>
	<div class="flex min-w-0 flex-col">
		<span class="truncate text-sm font-medium text-white">
			{displayName}
		</span>
		<span class="truncate text-xs text-white/70">
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
	<!-- Nothing up here is interactive, and it must stay click-through — it spans
	     the width of PhotoSwipe's own toolbar (download, zoom, close), which sits
	     underneath — so it overrides the class's pointer-events. -->
	<header
		bind:this={topBar}
		class="pswp__hide-on-close pointer-events-none! flex flex-col gap-2 bg-linear-to-b from-black/70 to-transparent px-3 pt-(--safe-area-top) pb-6"
	>
		<!-- Kept in the layout even with nothing to show — a single photo, or a feed
		     whose slides aren't one set — so the name and avatar below sit at the
		     same height in every viewer. h-3 is the row's own height (pt-2 + the
		     4px pills) under border-box, so both states measure the same.
		     Each pill is a fixed size, so two photos and eight look alike and the
		     row simply grows; stretching segments to the page width reads as a
		     loading bar rather than as your place in a set. They shrink only past
		     the point where the row would outgrow its cap. -->
		<div
			class="mx-auto flex h-3 max-w-64 items-center justify-center gap-1 pt-2"
			aria-hidden="true"
		>
			{#if progress && count > 1}
				{#if count <= MAX_SEGMENTS}
					{#each { length: count }, i}
						<span
							class={[
								"h-1 w-6 min-w-1 rounded-full transition-colors",
								i === index ? "bg-white" : "bg-white/35",
							]}
						></span>
					{/each}
				{:else}
					<span class="h-1 w-32 rounded-full bg-white/35">
						<span
							class="block h-full rounded-full bg-white transition-[width]"
							style="width: {((index + 1) / count) * 100}%"
						></span>
					</span>
				{/if}
			{/if}
		</div>
		<!-- Padded clear of the toolbar buttons (download, zoom, close) that
		     PhotoSwipe draws in the same corner. Only this block takes pointer
		     events back from the click-through header, and only as wide as its
		     content, so it never covers the toolbar. -->
		{#if linksToProfile}
			<button
				type="button"
				onclick={openProfile}
				onpointerdown={stopPointer}
				aria-label="Open {displayName}'s profile"
				class="pointer-events-auto me-38 flex w-fit max-w-full min-w-0 items-center gap-2.5 rounded-full text-start transition-opacity active:opacity-70"
			>
				{@render identity()}
			</button>
		{:else}
			<div class="me-38 flex w-fit max-w-full min-w-0 items-center gap-2.5">
				{@render identity()}
			</div>
		{/if}
	</header>

	{#if hasBar}
		<form
			bind:this={bottomBar}
			class="pswp__hide-on-close pointer-events-auto relative flex items-center gap-2 bg-linear-to-t from-black/70 to-transparent px-3 pt-6 pb-[calc(0.75rem+var(--safe-area-bottom))]"
			onpointerdown={stopPointer}
			onsubmit={sendReply}
		>
			{#if sentLabel !== null}
				<!-- Absolute so it never changes the bar's height, which is what the
				     lightbox pads the media by. -->
				<div
					class="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
					aria-live="polite"
				>
					<span
						class="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-md"
					>
						{sentLabel}
					</span>
				</div>
			{/if}
			{#if actions.onReply !== undefined}
				<div class="relative min-w-0 flex-1">
					<input
						type="text"
						bind:value={draft}
						disabled={sending}
						enterkeyhint="send"
						placeholder="Reply to this..."
						aria-label="Reply to this photo"
						onkeydown={(event) => {
							// Explicit rather than relying on implicit submission: PhotoSwipe
							// handles keys on the root this field is mounted into.
							if (event.key !== "Enter") return;
							event.preventDefault();
							event.currentTarget.form?.requestSubmit();
						}}
						class="h-11 w-full rounded-full bg-white/15 px-4 text-sm text-white backdrop-blur-md outline-none placeholder:text-white/60 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-60"
						class:pe-12={draft.trim() !== ""}
					/>
					{#if draft.trim() !== ""}
						<button
							type="submit"
							disabled={sending}
							aria-label="Send reply"
							class="absolute end-1 top-1 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-60"
						>
							<PaperPlaneRightIcon weight="fill" class="size-4.5" />
						</button>
					{/if}
				</div>
			{:else}
				<div class="flex-1"></div>
			{/if}
			{#if actions.onReact !== undefined}
				<button
					type="button"
					onclick={react}
					disabled={reacting}
					aria-label="React with fire"
					class="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-transform active:scale-90 disabled:opacity-60"
				>
					<img
						src={fireEmoji}
						alt=""
						width="24"
						height="24"
						draggable="false"
						class="size-6"
					/>
				</button>
			{/if}
			{#if actions.onOpenChat !== undefined}
				<button
					type="button"
					onclick={openChat}
					aria-label="Open chat"
					class="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-transform active:scale-90"
				>
					<ChatCircleIcon class="size-6" />
				</button>
			{/if}
		</form>
	{/if}
</div>
