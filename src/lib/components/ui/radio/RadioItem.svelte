<script lang="ts">
	import { getContext } from "svelte";
	import type { Snippet } from "svelte";
	import { CheckIcon } from "phosphor-svelte";

	let {
		value: itemValue,
		children,
	}: {
		value: string;
		children: Snippet;
	} = $props();

	const context = getContext<{
		value: string;
		name: string;
		allowDeselect: boolean;
	}>("radio-group");

	function handleChange(e: Event) {
		context.value = itemValue;
	}

	function handleClick(e: Event) {
		console.log(context.allowDeselect);
		if (context.allowDeselect === false) {
			return;
		}
		if (context.value !== itemValue) {
			return;
		}
		const target = e.target as HTMLInputElement;
		if (target.tagName != "INPUT") {
			return;
		}
		context.value = "";
		target.checked = false;
	}

	function handleKeyPress(e: KeyboardEvent) {
		if (context.allowDeselect === false) {
			return;
		}
		if (context.value !== itemValue) {
			return;
		}

		const target = e.target as HTMLInputElement;
		if (target.tagName != "INPUT") {
			console.log("not input");
			return;
		}

		if (e.key !== " " && e.key !== "Spacebar") {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();

		context.value = "";
		target.checked = false;
	}
</script>

<!-- The user can't navigate to a label with keyboard. They will focus the input -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<label
	class="flex cursor-pointer items-center bg-input/20 p-4"
	onclick={handleClick}
>
	<div class="w-full pl-3">
		{@render children()}
	</div>
	<div class="relative flex size-5 items-center justify-center">
		<input
			type="radio"
			name={context.name}
			value={itemValue}
			checked={context.value === itemValue}
			onchange={handleChange}
			onkeydown={handleKeyPress}
			class="peer size-5 cursor-pointer appearance-none rounded-full border-2 border-gray-300 bg-transparent transition-all outline-none checked:border-yellow-400 checked:bg-primary focus-visible:ring-2 focus-visible:ring-offset-2"
		/>
		<CheckIcon
			class="pointer-events-none absolute size-3.5 scale-50 text-black opacity-0 transition-all duration-200 peer-checked:scale-100 peer-checked:opacity-100"
		/>
	</div>
</label>
