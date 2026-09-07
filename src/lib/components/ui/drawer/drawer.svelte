<script lang="ts">
	import { Drawer as DrawerPrimitive } from "vaul-svelte";

	let {
		shouldScaleBackground = true,
		// Off: the app already sizes bottom sheets around the keyboard in CSS
		// (--keyboard-height, max-h-screen-safe). vaul's version writes an inline
		// height from the drawer's measured one, so a single short measurement mid
		// keyboard animation latches the drawer into a sliver above the keys.
		repositionInputs = false,
		open = $bindable(false),
		activeSnapPoint = $bindable(null),
		...restProps
	}: DrawerPrimitive.RootProps = $props();
</script>

<DrawerPrimitive.Root
	{shouldScaleBackground}
	{repositionInputs}
	bind:open
	bind:activeSnapPoint
	{...restProps}
/>
