<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import FilterDropdown from "./FilterDropdown.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: string } = $props();
</script>

<FilterDropdown
	id="username"
	label="Username"
	endLabel={value.trim()}
	bind:checked={
		() => checked,
		(newValue: boolean) => {
			checked = newValue;
			if (!newValue) {
				value = "";
			}
		}
	}
>
	<div class="w-full pe-1">
		<Input
			id="filter-username"
			type="search"
			placeholder="Name contains..."
			autocapitalize="none"
			autocorrect="off"
			spellcheck={false}
			class="text-sm"
			bind:value={
				() => value,
				(v: string) => {
					value = v;
					checked = v.trim() !== "";
				}
			}
		/>
	</div>
</FilterDropdown>
