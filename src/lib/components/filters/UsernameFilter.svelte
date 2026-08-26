<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import { nearestScrollableAncestor } from "$lib/util/scroll";
	import FilterDropdown from "./FilterDropdown.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: string } = $props();

	let input: HTMLInputElement | null = $state(null);

	/**
	 * Brings the field up into what the keyboard leaves of the sheet.
	 *
	 * The sheet only shrinks once the keyboard's viewport resize lands, so the
	 * reveal WebKit does at focus time is measured against the taller sheet and
	 * leaves the field under the keys. Wait for that resize — or give up on a
	 * timer, since a keyboard already up never sends one — then scroll the
	 * sheet's own scroller: `scrollIntoView` would walk past it and drag the
	 * whole sheet instead.
	 */
	function revealField() {
		const viewport = window.visualViewport;
		const settle = () => {
			clearTimeout(timer);
			viewport?.removeEventListener("resize", settle);
			const el = input;
			const scroller = el && nearestScrollableAncestor(el);
			if (!el || !(scroller instanceof HTMLElement)) return;
			const offset =
				el.getBoundingClientRect().top -
				scroller.getBoundingClientRect().top;
			scroller.scrollTo({
				top: Math.max(
					0,
					scroller.scrollTop +
						offset -
						(scroller.clientHeight - el.offsetHeight) / 2,
				),
				behavior: "smooth",
			});
		};
		const timer = setTimeout(settle, 400);
		viewport?.addEventListener("resize", settle);
	}
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
			bind:ref={input}
			id="filter-username"
			type="search"
			placeholder="Name contains..."
			autocapitalize="none"
			autocorrect="off"
			spellcheck={false}
			class="text-sm"
			onfocus={revealField}
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
