<script lang="ts">
	import { ChatIcon, NotePencilIcon, StarIcon } from "phosphor-svelte";
	import type { Snippet } from "svelte";

	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import ProfileRightNowIndicator from "$lib/components/profile/ProfileRightNowIndicator.svelte";
	import ProfileStatusIndicator from "$lib/components/profile/ProfileStatusIndicator.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import type { RightNowStatus } from "$lib/model/right-now";

	let {
		mediaHash = null,
		displayName = null,
		age = null,
		distance = null,
		unread = null,
		onlineUntil = null,
		isFavorite = false,
		isVisiting = false,
		hadRecentChat = false,
		note = null,
		href = null,
		class: className,
		rightNow = null,
		overlay,
	}: {
		mediaHash?: string | null;
		displayName?: string | null;
		age?: number | null;
		distance?: number | null;
		unread?: number | null;
		onlineUntil?: number | null;
		isFavorite?: boolean;
		isVisiting?: boolean;
		hadRecentChat?: boolean;
		/** The note the user attached to this favorite, if any. */
		note?: string | null;
		href?: string | null;
		class?: import("svelte/elements").ClassValue;
		rightNow?: RightNowStatus | null;
		overlay?: Snippet;
	} = $props();

	const noteText = $derived(note?.trim() ?? "");

	// Whether the card has anything to say about who this is — what the note
	// stacks on top of when it does.
	const hasIdentity = $derived(
		displayName !== null ||
			age !== null ||
			isVisiting ||
			(rightNow !== null && rightNow !== "NOT_ACTIVE"),
	);

	// Only the text actually rendered on the card, so the card gets an
	// aria-label exactly when it would otherwise announce nothing.
	const hasVisibleText = $derived(
		displayName !== null || age !== null || distance !== null,
	);
</script>

{#snippet content()}
	<div class="absolute size-full bg-media-placeholder">
		<UserAvatar {mediaHash} class="size-full" size="xl" />
	</div>
	{#if distance !== null}
		<span class="profile-card-distance absolute top-1.5 right-1.5 z-1">
			<DistanceFormatted {distance} />
		</span>
	{/if}
	<!-- Bare glyphs in the corner, no disc behind them: at three tiles across, a
	     filled plate per marker is most of what you see. A shadow carries them
	     over a light photo the same way the distance label is carried. -->
	{#if isFavorite || hadRecentChat}
		<div class="absolute inset-s-1.5 top-1.5 z-1 flex flex-col gap-1">
			{#if isFavorite}
				<StarIcon
					weight="fill"
					class="marker text-yellow-400"
					aria-label="Saved"
					role="img"
				/>
			{/if}
			{#if hadRecentChat}
				<ChatIcon weight="fill" class="marker text-plate-foreground" />
			{/if}
		</div>
	{/if}
	<!-- One label band per tile rather than scattered overlays: who this is on
	     the first line, the private note on the second. Either line may be
	     absent, and a tile with neither renders no band at all. -->
	{#if noteText !== "" || hasIdentity}
		<div
			class={[
				"tile-scrim z-1 flex min-w-0 items-end gap-1",
				{ "tile-scrim-tall": noteText !== "" && hasIdentity },
			]}
		>
			<div class="flex min-w-0 flex-1 flex-col">
				{#if hasIdentity}
					<div class="flex min-w-0 items-center">
						<ProfileStatusIndicator
							{onlineUntil}
							{isVisiting}
							class="me-1"
						/>

						<ProfileRightNowIndicator {rightNow} class="me-1" />

						{#if displayName !== null}
							<span
								class="truncate text-meta/[1.1] font-semibold"
							>
								{displayName}
							</span>
						{/if}
						{#if displayName !== null && age !== null}
							<span class="text-meta/[1.1] font-semibold"
								>,&nbsp;</span
							>
						{/if}
						{#if age !== null}
							<span
								class="shrink-0 text-meta/[1.1] font-semibold"
							>
								{age}
							</span>
						{/if}
					</div>
				{/if}
				{#if noteText !== ""}
					<div class="mt-0.5 flex min-w-0 items-center gap-1">
						<NotePencilIcon
							weight="fill"
							role="img"
							aria-label="Has a note"
							class="size-2.5 shrink-0 text-plate-accent"
						/>
						<span class="truncate text-3xs/[1.1] text-plate-muted">
							{noteText}
						</span>
					</div>
				{/if}
			</div>
			{#if unread !== null && unread > 0}
				<span
					class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-2xs font-semibold text-primary-foreground"
				>
					{#if unread > 99}
						<span class="text-3xs">99+</span>
					{:else}
						{unread}
					{/if}
				</span>
			{/if}
		</div>
	{/if}
	{@render overlay?.()}
{/snippet}

{#if href !== null}
	<a
		{href}
		aria-label={hasVisibleText ? undefined : "Profile"}
		class={[
			"relative flex aspect-square items-end overflow-hidden",
			className,
		]}
	>
		{@render content()}
	</a>
{:else}
	<div
		class={[
			"relative flex aspect-square items-end overflow-hidden",
			className,
		]}
	>
		{@render content()}
	</div>
{/if}

<style lang="postcss">
	@reference "$layout";

	/* A tile's corner status glyph. */
	:global(.marker) {
		@apply size-3.5 shrink-0;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.6));
	}
</style>
