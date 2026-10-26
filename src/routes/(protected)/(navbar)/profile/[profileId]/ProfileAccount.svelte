<script lang="ts">
	import { hideUser } from "$lib/api/browse/hides";
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import ReportSheet from "$lib/components/report/ReportSheet.svelte";
	import AccountCreated from "./fields/AccountCreated.svelte";
	import { blockProfile, copyProfileId } from "./profile-actions";
	import {
		applyViewabilityChange,
		type PendingViewabilityChange,
	} from "./profile-state.svelte";

	let {
		profileId,
		isNew,
		self,
		changingViewability,
		markBlocked,
		markHidden,
		canSendView = false,
		sendingView = false,
		sendView = () => {},
	}: {
		profileId: number;
		isNew: boolean;
		self: boolean;
		changingViewability: boolean;
		markBlocked: () => PendingViewabilityChange;
		markHidden: () => PendingViewabilityChange;
		canSendView?: boolean;
		sendingView?: boolean;
		sendView?: () => void;
	} = $props();

	let reportOpen = $state(false);
</script>

<!-- Sizes and glyphs follow the handoff mock for this section. -->
<div class="mt-6.5 flex flex-col">
	<span class="section-label">Account</span>
	<div class="mt-3 flex flex-col gap-2.5 text-caption text-ink3">
		<!-- Grindr's own "Recently joined" beats the estimate. -->
		{#if preferencesSnapshot().showAccountCreated && !isNew}
			<AccountCreated {profileId} />
		{/if}
		<div class="flex items-center gap-1.5">
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.3"
				stroke-linecap="round"
				class="mr-1 size-3.75 shrink-0 text-muted-foreground"
			>
				<path d="M6.4 2 5 14M11 2 9.6 14M2.6 5.6h11M2.2 10.4h11" />
			</svg>
			ID
			<span class="font-medium text-foreground tabular-nums"
				>{profileId}</span
			>
			<button
				type="button"
				aria-label="Copy profile ID"
				class="-m-2 ml-0 p-2"
				onclick={() => copyProfileId(profileId)}
			>
				<svg
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linejoin="round"
					class="size-3.5"
				>
					<rect x="5.2" y="5.2" width="8.6" height="8.6" rx="1.8" />
					<path
						d="M10.8 5.2V3.6a1.4 1.4 0 0 0-1.4-1.4H3.6a1.4 1.4 0 0 0-1.4 1.4v5.8a1.4 1.4 0 0 0 1.4 1.4h1.6"
					/>
				</svg>
			</button>
		</div>
	</div>
	{#if !self}
		<div class="mt-4.5 flex flex-col items-start gap-1">
			{#if canSendView}
				<button
					type="button"
					class="action"
					disabled={sendingView}
					onclick={sendView}
				>
					<svg viewBox="0 0 20 20">
						<path
							d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5Z"
						/>
						<circle cx="10" cy="10" r="2.2" />
					</svg>
					Send profile view
				</button>
			{/if}
			<button
				type="button"
				class="action"
				disabled={changingViewability}
				onclick={() =>
					applyViewabilityChange({
						change: markHidden,
						request: () => hideUser({ profileId }),
						failureLabel: "Failed to hide user",
					})}
			>
				<svg viewBox="0 0 20 20">
					<path
						d="M2.5 10s2.8-5 7.5-5c1.4 0 2.6.4 3.6 1M17.5 10s-2.8 5-7.5 5c-1.4 0-2.6-.4-3.6-1M3 17 17 3"
					/>
				</svg>
				Hide profile
			</button>
			<button
				type="button"
				class="action"
				onclick={() => (reportOpen = true)}
			>
				<svg viewBox="0 0 20 20">
					<path d="M4 18V3M4 3.5h10.5l-2 3.8 2 3.7H4" />
				</svg>
				Report profile
			</button>
		</div>
		<ReportSheet
			bind:open={reportOpen}
			{profileId}
			onBlock={() => void blockProfile({ profileId, markBlocked })}
		/>
	{/if}
</div>

<style lang="postcss">
	@reference "$layout";

	.action {
		@apply flex items-center gap-2.5 py-1.5 text-caption font-medium text-ink3 disabled:opacity-50;
	}
	.action svg {
		@apply size-3.75 shrink-0 fill-none stroke-current;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
