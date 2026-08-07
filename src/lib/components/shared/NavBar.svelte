<script lang="ts">
	import { page } from "$app/state";
	import ChatCircleIcon from "phosphor-svelte/lib/ChatCircleIcon";
	import LightningIcon from "phosphor-svelte/lib/LightningIcon";
	import SquaresFourIcon from "phosphor-svelte/lib/SquaresFourIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";
	import UserIcon from "phosphor-svelte/lib/UserIcon";
	import { untrack } from "svelte";

	import { getProfile } from "$lib/api/users/profiles";
	import { getOrCreateConversationsState } from "$lib/chat/conversations-context.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { hapticSelection } from "$lib/platform/haptics";
	import { scrollActiveViewToTop } from "$lib/util/scroll";

	let { ourProfileId }: { ourProfileId: number } = $props();

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

	// The "You" tab wears the user's own first photo when they have one, so the
	// generic glyph is only a fallback. A failed fetch falls back the same way.
	const ourAvatarHash = $derived(
		getProfile(ourProfileId).then((profile) => profile.medias[0]?.mediaHash),
	);

	// Each tab owns a route prefix rather than an exact id so subpages (a
	// settings subpage, an interest sub-tab) keep their tab lit.
	const tabs = [
		{
			href: "/",
			label: "Browse",
			icon: SquaresFourIcon,
			match: (id: string) => id === "/(protected)/(navbar)/(root)",
		},
		{
			href: "/right-now",
			label: "Right Now",
			icon: LightningIcon,
			match: (id: string) => id === "/(protected)/(navbar)/right-now",
		},
		{
			href: "/interest",
			label: "Interest",
			icon: StarIcon,
			match: (id: string) =>
				id.startsWith("/(protected)/(navbar)/interest") ||
				id.startsWith("/(protected)/(navbar)/favorites"),
		},
		{
			href: "/chat",
			label: "Inbox",
			icon: ChatCircleIcon,
			match: (id: string) => id.startsWith("/(protected)/chat"),
		},
		{
			href: "/settings",
			label: "You",
			icon: UserIcon,
			match: (id: string) => id.startsWith("/(protected)/(navbar)/settings"),
		},
	];
</script>

{#snippet glyph(Icon: (typeof tabs)[number]["icon"])}
	<Icon class="size-5.25" />
{/snippet}

<!-- Hairline on top and an opaque background — the redesign drops the blurred
     float in favour of a plain bar the grid scrolls up to.
     Height is pinned to --nav-height rather than left to the content: that token
     is what everything else offsets against (--content-pb for scroll padding,
     and the profile composer, which sits directly on top of this bar). Letting
     padding decide the height instead left the bar 2pt short of the token, and
     the page showed through the seam. -->
<nav
	class="fixed bottom-0 z-50 flex h-[calc(var(--nav-height)+var(--safe-area-bottom,0px))] w-full border-t border-border bg-background px-screen pb-(--safe-area-bottom)"
>
	{#each tabs as tab (tab.href)}
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
							<!-- Ringed only while active: at 21pt the photo is too small for a
							     colour shift to register, so the ring stands in for the tint
							     the glyph tabs get. -->
							<span
								class={[
									"block size-5.25 overflow-hidden rounded-full bg-media-placeholder",
									{ "ring-2 ring-current": active },
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
				{#if tab.href === "/chat" && hasUnread}
					<span
						class="absolute -top-0.5 -right-1 size-2 rounded-full bg-primary"
					></span>
				{/if}
			</span>
			<span class="text-3xs leading-none font-medium tracking-[0.02em]">
				{tab.label}
			</span>
		</a>
	{/each}
</nav>

<style lang="postcss">
	@reference "$layout";

	/* No active pill or fill: the item is coloured, and that is the whole
	   active state. min-h keeps every item at a 44pt hit target. */
	.tab {
		@apply relative flex min-h-11 flex-1 flex-col items-center justify-center gap-[5px] text-ink3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[active=true]:text-primary;
	}
</style>
