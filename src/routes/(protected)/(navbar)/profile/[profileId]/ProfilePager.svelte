<script lang="ts">
	import { untrack } from "svelte";
	import { SvelteMap } from "svelte/reactivity";

	import { hapticSelection } from "$lib/platform/haptics";
	import { type PanDirection, panPager } from "$lib/util/pan-pager";
	import ProfileBottomNavBar from "./bottom-nav/ProfileBottomNavBar.svelte";
	import type { ProfileState } from "./profile-state.svelte";
	import ProfileScreen from "./ProfileScreen.svelte";

	let {
		ids,
		activeId,
		ourProfileId,
		onactive,
		extend,
	}: {
		/** Profiles to page through, in the order the originating list had them. */
		ids: number[];
		activeId: number;
		ourProfileId: number;
		/** The profile a swipe landed on, as soon as it is committed to. */
		onactive?: (profileId: number) => void;
		/** Grows `ids` past what was loaded when the profile was opened. */
		extend?: () => Promise<void>;
	} = $props();

	// How far the settled page follows a drag that has nowhere to go.
	const RUBBER_BAND = 0.35;
	// Ids left ahead of the current one before more are fetched.
	const EXTEND_MARGIN = 2;
	const SETTLE = "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";

	// The pager's own idea of where it is. `activeId` seeds it and re-seeds it
	// when something outside the pager changes the profile, but a swipe moves
	// this first and tells the parent afterwards, so the track never jumps back
	// mid-animation.
	let index = $state(untrack(() => Math.max(0, ids.indexOf(activeId))));
	let dragX = $state(0);
	let settling = $state(false);
	let extending = false;

	$effect(() => {
		const wanted = ids.indexOf(activeId);
		untrack(() => {
			if (wanted !== -1) {
				if (wanted !== index && !settling) index = wanted;
			} else if (index > ids.length - 1) {
				// The list this came from is live and can shrink under us. An index
				// past its end mounts no panes at all — a blank screen — so it falls
				// back to the last profile still in the list.
				index = Math.max(0, ids.length - 1);
			}
		});
	});

	// Only the current profile and its immediate neighbours are mounted: the
	// neighbours so a swipe animates onto a loaded profile instead of a
	// skeleton, and no further because each one is a profile fetch.
	const panes = $derived(
		[index - 1, index, index + 1].flatMap((i) => {
			const id = ids[i];
			return id === undefined ? [] : [{ index: i, id }];
		}),
	);

	$effect(() => {
		if (!extend || index < ids.length - 1 - EXTEND_MARGIN) return;
		if (extending) return;
		extending = true;
		void extend().finally(() => {
			extending = false;
		});
	});

	function canGo(direction: PanDirection): boolean {
		const next = index + direction;
		return next >= 0 && next < ids.length;
	}

	function onpan(dx: number) {
		settling = false;
		// Past either end there is nothing to pull in, so the page only gives a
		// little rather than sliding a blank pane into view.
		const resists = (dx > 0 && index === 0) || (dx < 0 && !canGo(1));
		dragX = resists ? dx * RUBBER_BAND : dx;
	}

	function oncommit(direction: PanDirection) {
		// Both styles change in the same update: the browser reads the
		// after-change transition, so the track eases to the new page from
		// wherever the finger left it.
		settling = true;
		dragX = 0;
		index += direction;
		hapticSelection();
		const id = ids[index];
		if (id !== undefined) onactive?.(id);
	}

	function oncancel() {
		settling = true;
		dragX = 0;
	}

	// Each mounted profile lends the pager its state so the bottom bar, which
	// lives outside the sliding track, can read the active profile's tap and
	// write back to it. Keyed by id rather than handed over on activation: the
	// neighbours register when they mount, so the bar is already wired to the
	// profile a swipe lands on by the time it arrives.
	const states = new SvelteMap<number, ProfileState>();

	function register(profileId: number, state: ProfileState | null): void {
		if (state) states.set(profileId, state);
		else states.delete(profileId);
	}

	// Where the track actually is, which during a settle is already the profile
	// being swiped to — `activeId` is the parent's view and trails it.
	const currentId = $derived(ids[index]);
	const activeState = $derived(
		currentId === undefined ? null : (states.get(currentId) ?? null),
	);
</script>

<div class="relative -mb-(--nav-height) h-screen-safe">
	<div
		class="absolute inset-0 touch-pan-y overflow-hidden"
		use:panPager={{
			canGo,
			onpan,
			oncommit,
			oncancel,
			enabled: ids.length > 1,
		}}
	>
		<div
			class="absolute inset-0"
			style:transform="translate3d(calc({-index * 100}% + {dragX}px), 0,
			0)"
			style:transition={settling ? SETTLE : "none"}
			style:will-change={settling || dragX !== 0 ? "transform" : "auto"}
			ontransitionend={(event) => {
				// transitionend bubbles, and the profiles inside have transitions
				// of their own — only the track's own settle ends the settle.
				if (event.target === event.currentTarget) settling = false;
			}}
		>
			{#each panes as pane (pane.id)}
				<div
					class="absolute inset-y-0 flex w-full flex-col"
					style:left="{pane.index * 100}%"
					inert={pane.index !== index}
				>
					<ProfileScreen
						profileId={pane.id}
						{ourProfileId}
						active={pane.index === index}
						{register}
					/>
				</div>
			{/each}
		</div>
	</div>
	<!-- Outside the track, and outside the clip: the track carries a transform,
	     which makes it the containing block for anything `fixed` inside it and
	     puts its panes' scrollers on composited layers that WebKit paints over
	     positioned siblings regardless of z-index. Kept here, the bar is a plain
	     viewport-fixed element again, exactly as it was before the pager.

	     Rendered from the active id rather than from loaded profile data, so it
	     never pops in a frame late; `activeState` only fills in the tap. -->
	{#if currentId !== undefined && !activeState?.error}
		<ProfileBottomNavBar
			{ourProfileId}
			profileId={currentId}
			tapType={activeState?.profile?.tapType ?? null}
			onTap={(tapType) => activeState?.setTap(tapType)}
		/>
	{/if}
</div>
