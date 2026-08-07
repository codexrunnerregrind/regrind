<script lang="ts">
	import { Switch } from "$lib/components/ui/switch";
	import { inlineLabelClass, inlineRowClass } from "./row";

	let { label, checked = $bindable() }: { label: string; checked: boolean } =
		$props();
</script>

<!-- A <label> so the whole row width toggles the switch, not just the control. -->
<label class={inlineRowClass}>
	<span class={inlineLabelClass}>{label}</span>
	<span class="ms-auto">
		<Switch bind:checked />
	</span>
</label>
