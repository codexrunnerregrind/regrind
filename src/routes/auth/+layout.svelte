<script lang="ts">
	import AddAccountNotice from "./AddAccountNotice.svelte";

	let { children }: { children: import("svelte").Snippet } = $props();
</script>

<main
	class="flex min-h-dvh w-full flex-col px-8 pt-[calc(2rem+var(--safe-area-top))] pb-[calc(2rem+var(--safe-area-bottom))]"
>
	<AddAccountNotice />
	{@render children?.()}
</main>
