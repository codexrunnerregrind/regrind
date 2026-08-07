<script lang="ts">
	import Button from "$lib/components/ui/button/button.svelte";

	let {
		profileId,
		ourProfileId,
	}: { profileId: number; ourProfileId: number } = $props();

	const conversationId = $derived(
		[profileId, ourProfileId].toSorted((a, b) => a - b).join(":"),
	);
</script>

<!-- Mirrors the media viewer's reply field: a 44pt pill on the muted fill, its
     label sitting where a placeholder would. Not a real input — tapping it opens
     the conversation, where the message is actually written. -->
<Button
	variant="ghost"
	size="lg"
	class="h-11 flex-1 justify-start rounded-composer bg-muted px-4.5 hover:bg-muted"
	href="/chat/{conversationId}"
>
	<span class="text-sm font-normal text-ink3">Write a message...</span>
</Button>
