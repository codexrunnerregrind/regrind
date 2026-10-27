<script lang="ts">
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";
	import SparkleIcon from "phosphor-svelte/lib/SparkleIcon";
	import { toast } from "svelte-sonner";

	import { setPreferences } from "$lib/app-data/preferences.svelte";
	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import { armProfileDeck } from "$lib/profile/profile-deck";
	import { getNow } from "$lib/util/now";
	import type { RenderedGridProfile } from "$lib/grid/grid";

	const HOUR_MS = 60 * 60 * 1000;

	let {
		profiles,
		refreshAt,
	}: { profiles: RenderedGridProfile[]; refreshAt: number | null } = $props();

	function hide() {
		void setPreferences({ gridForYou: false });
		toast("For you hidden", {
			description: "Bring it back anytime in App Settings.",
			action: {
				label: "Undo",
				onClick: () => void setPreferences({ gridForYou: true }),
			},
		});
	}

	const refreshLabel = $derived.by(() => {
		if (refreshAt === null) return null;
		const left = refreshAt - getNow();
		if (left <= 0) return null;
		return left >= HOUR_MS
			? `New picks in ${Math.ceil(left / HOUR_MS)}h`
			: `New picks in ${Math.ceil(left / 60_000)}m`;
	});
</script>

<section aria-labelledby="for-you-heading" class="pt-4 pb-4">
	<div class="mx-4 mb-2.5 flex items-center justify-between gap-3">
		<div class="flex min-w-0 items-baseline gap-2">
			<h2
				id="for-you-heading"
				class="flex items-baseline gap-1.5 font-heading text-sm font-semibold"
			>
				<SparkleIcon class="size-4 shrink-0 self-center text-primary" />
				<span>For you</span>
			</h2>
			{#if refreshLabel}
				<span class="truncate text-2xs text-ink3">{refreshLabel}</span>
			{/if}
		</div>
		<button
			type="button"
			class="-me-2 flex shrink-0 cursor-pointer items-center gap-1.25 px-2 py-1 text-xs font-medium text-muted-foreground"
			onclick={hide}
		>
			<EyeSlashIcon class="size-3.5" />
			Hide
		</button>
	</div>
	<div class="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
		{#each profiles as item (item.id)}
			<ProfileMiniCard
				portrait
				class="w-2/5 max-w-48 shrink-0 rounded-pick"
				mediaHash={item.profilePhotosHashes?.[0] ?? null}
				displayName={item.displayName}
				distance={item.distance}
				onlineUntil={item.onlineUntil}
				isFavorite={item.isFavorite}
				rightNow={item.rightNow}
				href="/profile/{item.id}"
				onclick={() =>
					armProfileDeck(item.id, {
						ids: profiles.map((profile) => profile.id),
					})}
			/>
		{/each}
	</div>
</section>
