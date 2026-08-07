<script lang="ts">
	let {
		children,
	}: {
		children: import("svelte").Snippet;
	} = $props();
</script>

<!-- A settings row's glyph. No coloured tile behind it: in this design colour is
     signal, so a list of tinted squares would spend all of it on decoration and
     leave none for the one row that matters (Sign out). Structure comes from the
     card groups and their labels instead. -->
<span
	class="flex size-[17px] shrink-0 items-center justify-center [&_svg]:size-[17px]"
>
	{@render children()}
</span>
