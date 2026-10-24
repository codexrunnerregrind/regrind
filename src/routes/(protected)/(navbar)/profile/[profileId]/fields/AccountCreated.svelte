<script lang="ts">
	import { estimateAccountCreation } from "$lib/model/users/account-age";

	let { profileId }: { profileId: number } = $props();

	const created = $derived(
		estimateAccountCreation(profileId).toLocaleDateString(undefined, {
			month: "short",
			year: "numeric",
		}),
	);
</script>

<div class="flex items-center gap-1.5">
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.3"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="mr-1 size-3.75 shrink-0 text-muted-foreground"
	>
		<rect x="2.2" y="3.2" width="11.6" height="10.6" rx="1.8" />
		<path d="M2.2 6.6h11.6M5.4 1.8v2.6M10.6 1.8v2.6" />
	</svg>
	Created <span class="font-medium text-foreground">~{created}</span>
</div>
