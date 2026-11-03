<script lang="ts">
	import { env } from "$env/dynamic/public";

	import UserSilhouette from "$lib/components/profile/UserSilhouette.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { profileMediaUrl } from "$lib/util/media";

	let {
		mediaHash,
		class: className = "size-80",
		size = "md",
		transitionName = null,
		onload,
	}: {
		mediaHash: string | null;
		class?: import("svelte/elements").ClassValue;
		size?: "md" | "lg" | "xl";
		transitionName?: string | null;
		onload?: (image: HTMLImageElement) => void;
	} = $props();
</script>

<div class={[className]} style:view-transition-name={transitionName}>
	{#if mediaHash}
		<MediaImage
			src={profileMediaUrl({ mediaHash, size: "thumb" })}
			class="h-full w-full"
			imgClass={[
				"bg-media-placeholder",
				{ "blur-2xl": env.PUBLIC_ENABLE_BLUR_EFFECTS },
			]}
			tone="photo"
			{size}
			loading="lazy"
			{onload}
		/>
	{:else}
		<div
			class="flex size-full items-center justify-center bg-media-placeholder"
		>
			<UserSilhouette
				class={[
					"m-auto",
					{
						"size-1/2": size === "md",
						"size-3/5": size === "lg",
						"size-3/4": size === "xl",
					},
				]}
			/>
		</div>
	{/if}
</div>
