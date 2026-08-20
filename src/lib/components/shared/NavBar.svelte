<script lang="ts">
	import { page } from "$app/state";
	import { untrack } from "svelte";

	import { getProfile } from "$lib/api/users/profiles";
	import { getOrCreateConversationsState } from "$lib/chat/conversations-context.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { navTabs } from "$lib/components/shared/nav-tabs";
	import { getTapsState } from "$lib/interest/taps-state.svelte";
	import { getViewActivityState } from "$lib/interest/view-activity.svelte";
	import { hapticSelection } from "$lib/platform/haptics";
	import { isFloatingNav } from "$lib/platform/nav-style.svelte";
	import { scrollActiveViewToTop } from "$lib/util/scroll";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const glass = $derived(isFloatingNav());

	function onTabClick(event: MouseEvent, currentTab: boolean) {
		if (currentTab) {
			// Re-tapping the active tab scrolls its view back to the top
			// instead of navigating.
			event.preventDefault();
			scrollActiveViewToTop();
		} else {
			hapticSelection();
		}
	}

	const conversations = untrack(() =>
		getOrCreateConversationsState(ourProfileId),
	);
	const hasUnread = $derived(conversations.hasUnread);

	// Lives here rather than in the Interest route so a view that lands while the
	// user is anywhere else still lights the tab.
	const viewActivity = untrack(() => getViewActivityState(ourProfileId));
	const hasUnseenViews = $derived(viewActivity.hasUnseenViews);

	// Taps light the same tab as views: both are somebody showing interest, and
	// the Interest tab is where either of them is read.
	const taps = untrack(() => getTapsState(ourProfileId));
	const hasUnseenTaps = $derived(taps.hasUnseen);

	// The "You" tab wears the user's own first photo when they have one, so the
	// generic glyph is only a fallback. A failed fetch falls back the same way.
	const ourAvatarHash = $derived(
		getProfile(ourProfileId).then(
			(profile) => profile.medias[0]?.mediaHash,
		),
	);

	// Which tab the pill sits over. A route no tab claims (there is none today,
	// but a future one would) leaves it under the first rather than off-screen.
	const activeIndex = $derived(
		Math.max(
			navTabs.findIndex((tab) => tab.match(page.route.id ?? "")),
			0,
		),
	);
</script>

{#snippet glyph(Icon: (typeof navTabs)[number]["icon"])}
	<Icon class="size-5.25" />
{/snippet}

<!-- Two shapes share one set of tabs. Docked: a full-width bar with a hairline,
     opaque, that the grid scrolls up to. Floating (the Glass appearance
     setting): an inset capsule — the system glass material on iOS, a blur
     behind a tint elsewhere — with a selection pill that slides between tabs.
     The capsule is one size; it does not answer to scrolling. A version that
     contracted as you scrolled down a list shuddered on iOS, the glyphs jumping
     as the labels squeezed in and out, and neither the state machine behind it
     nor the way it was painted turned out to explain it.
     Either way the <nav> keeps the same footprint: its height is pinned to
     --nav-height because that token is what everything else offsets against
     (--content-pb for scroll padding, and the profile composer, which sits
     directly on top of this bar). The capsule floats *inside* that box, so
     switching shapes never moves anything else on the screen. -->
<nav
	class={[
		"fixed bottom-0 z-50 flex h-[calc(var(--nav-height)+var(--safe-area-bottom,0px))] w-full pb-(--safe-area-bottom)",
		{
			// The box itself stops taking taps so the content it floats over stays
			// reachable at the edges; the capsule takes them back.
			"pointer-events-none items-center justify-center px-3": glass,
			"border-t border-border bg-background px-screen": !glass,
		},
	]}
>
	<div
		class={[
			"relative flex w-full items-stretch",
			{
				"nav-capsule pointer-events-auto h-14 max-w-104 rounded-full px-1.5 glass-normal":
					glass,
			},
		]}
	>
		{#if glass}
			<!-- One pill, moved, rather than a fill per tab: the slide between tabs is
			     the tab bar's signature, and a shared element is what makes it read as
			     one object moving instead of two crossfading. Width is an exact fifth
			     because every tab is flex-1 in the same row. -->
			<span
				aria-hidden="true"
				class="pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/5)] rounded-full bg-primary/15 ring-1 ring-primary/25 transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
				style:transform="translateX(calc({activeIndex} * 100%))"
			></span>
		{/if}
		{#each navTabs as tab (tab.href)}
			{@const active = tab.match(page.route.id ?? "")}
			<a
				href={tab.href}
				data-active={active}
				onclick={(e) => onTabClick(e, active)}
				class="tab"
			>
				<span class="relative">
					{#if tab.href === "/settings"}
						{#await ourAvatarHash}
							{@render glyph(tab.icon)}
						{:then mediaHash}
							{#if mediaHash}
								<!-- Ringed only while active, and only in the docked bar: at 21pt
							     the photo is too small for a color shift to register, so the
							     ring stands in for the tint the glyph tabs get. The floating bar
							     already marks the tab with the pill, and both at once reads as
							     two selections. -->
								<span
									class={[
										"block size-5.25 overflow-hidden rounded-full bg-media-placeholder",
										{
											"ring-2 ring-current":
												active && !glass,
										},
									]}
								>
									<UserAvatar
										{mediaHash}
										class="size-full *:rounded-full"
										size="md"
									/>
								</span>
							{:else}
								{@render glyph(tab.icon)}
							{/if}
						{:catch}
							{@render glyph(tab.icon)}
						{/await}
					{:else}
						{@render glyph(tab.icon)}
					{/if}
					{#if (tab.href === "/chat" && hasUnread) || (tab.href === "/interest" && (hasUnseenViews || hasUnseenTaps))}
						<span
							class="absolute -top-0.5 -right-1 size-2 rounded-full bg-primary"
						></span>
					{/if}
				</span>
				<span
					class="text-3xs leading-none font-medium tracking-[0.02em]"
				>
					{tab.label}
				</span>
			</a>
		{/each}
	</div>
</nav>

<style lang="postcss">
	@reference "$layout";

	/* Docked: no active pill or fill — the item is colored, and that is the whole
	   active state. The floating bar adds the pill behind it. min-h keeps every
	   item at a 44pt hit target. */
	.tab {
		@apply relative z-1 flex min-h-11 flex-1 flex-col items-center justify-center gap-[5px] text-ink3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[active=true]:text-primary;
	}

	/* The material carries its own edge, but not the separation from the content
	   it floats over — that is this shadow's job. Declared through Tailwind
	   rather than as a bare box-shadow so it composes with the ring the fallback
	   below adds: ring-* writes the whole box-shadow property out of its own
	   variables, and a hand-written one next to it is simply overwritten. */
	.nav-capsule {
		@apply shadow-[0_8px_28px_rgb(0_0_0/0.28),0_1px_2px_rgb(0_0_0/0.16)];
	}

	/* Everywhere but iOS this is the surface, not a stopgap, so it is built
	   rather than inherited: glass-normal's fallback is a bare 6px blur, which
	   leaves the labels sitting on whatever happens to be behind them. A wider
	   blur, the saturation the system material adds back to what it blurs, a tint
	   for contrast and a hairline for the edge. */
	@supports not (-apple-visual-effect: -apple-system-glass-material) {
		.nav-capsule {
			@apply bg-background/72 ring-1 ring-border/60;
			backdrop-filter: blur(20px) saturate(1.8);
		}
	}

	/* A blur is the one part with no substitute: without it the tint alone is a
	   flat panel, so it leans opaque instead of pretending to be glass. */
	@supports not (
		(backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))
	) {
		.nav-capsule {
			@apply bg-background/95;
		}
	}
</style>
