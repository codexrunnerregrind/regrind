<script lang="ts">
	import type { Snippet } from "svelte";
	import { setContext } from "svelte";

	let {
		value = $bindable(""),
		name,
		allowDeselect = false,
		children,
	}: {
		value: string;
		name: string;
		allowDeselect?: boolean;
		children: Snippet;
	} = $props();

	setContext("radio-group", {
		get value() {
			return value;
		},
		set value(v: string) {
			value = v;
		},
		get name() {
			return name;
		},
		get allowDeselect() {
			return allowDeselect;
		},
	});
</script>

<fieldset class="flex flex-col gap-0.5 overflow-hidden rounded-lg">
	{@render children()}
</fieldset>
