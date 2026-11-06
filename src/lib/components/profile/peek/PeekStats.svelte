<script lang="ts">
	import PersonSimpleIcon from "phosphor-svelte/lib/PersonSimpleIcon";
	import RulerIcon from "phosphor-svelte/lib/RulerIcon";
	import type { Component } from "svelte";

	import { getProfile } from "$lib/api/users/profiles";
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import { sexualPositionIcons } from "$lib/components/profile/sexual-position-icons";
	import {
		bodyTypes,
		type Profile,
		sexualPositions,
		sexualPositionSchema,
	} from "$lib/model/users/profiles";
	import { labelFromMap } from "$lib/util/options";
	import { reducedMotion } from "$lib/util/reduced-motion";
	import { formatHeight, formatWeightGrams } from "$lib/util/units";

	let {
		profileId,
		onProfile,
	}: { profileId: number; onProfile?: (profile: Profile) => void } = $props();

	let profile = $state<Profile | null>(null);

	$effect(() => {
		let live = true;
		getProfile(profileId)
			.then((loaded) => {
				if (!live) return;
				profile = loaded;
				onProfile?.(loaded);
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	});

	type Stat = { icon: Component; label: string; flip?: boolean };

	const stats = $derived.by((): Stat[] => {
		if (profile === null) return [];
		const units = preferencesSnapshot().units;
		const list: Stat[] = [];
		const position = sexualPositionSchema.safeParse(
			profile.sexualPosition,
		).data;
		if (position !== undefined) {
			list.push({
				icon: sexualPositionIcons[position],
				label: sexualPositions[position],
			});
		}
		const size = [
			profile.height === null
				? null
				: formatHeight(profile.height, units),
			profile.weight === null
				? null
				: formatWeightGrams(profile.weight, units),
		].filter((part) => part !== null);
		if (size.length > 0) {
			list.push({ icon: RulerIcon, label: size.join(" · "), flip: true });
		}
		const body =
			profile.bodyType === null
				? undefined
				: labelFromMap({ labels: bodyTypes, id: profile.bodyType });
		if (body !== undefined)
			list.push({ icon: PersonSimpleIcon, label: body });
		return list;
	});

	function pop(index: number) {
		return (node: HTMLElement) => {
			if (reducedMotion.current) return;
			node.animate?.(
				[
					{ opacity: 0, transform: "translateY(6px) scale(0.9)" },
					{ opacity: 1, transform: "none" },
				],
				{
					duration: 280,
					delay: index * 50,
					easing: "cubic-bezier(0.34, 1.32, 0.64, 1)",
					fill: "both",
				},
			);
		};
	}
</script>

{#if stats.length > 0}
	<div class="flex flex-wrap gap-1.5">
		{#each stats as stat, index (stat.label)}
			<span
				class="flex items-center gap-1 rounded-full bg-white/16 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white backdrop-filter-(--bd-veil)"
				{@attach pop(index)}
			>
				<stat.icon
					class={["size-3.5 shrink-0", { "rotate-y-180": stat.flip }]}
				/>
				{stat.label}
			</span>
		{/each}
	</div>
{/if}
