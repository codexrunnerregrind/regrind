<script lang="ts">
	import AddAccountNotice from "./AddAccountNotice.svelte";

	let { children }: { children: import("svelte").Snippet } = $props();
</script>

<main class="flex min-h-dvh w-full flex-col p-safe-8">
	<AddAccountNotice />
	{@render children?.()}
</main>
