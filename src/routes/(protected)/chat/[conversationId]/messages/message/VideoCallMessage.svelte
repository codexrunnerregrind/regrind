<script lang="ts">
	import { PhoneSlashIcon, VideoCameraIcon } from "phosphor-svelte";

	import {
		videoCallOutcome,
		videoCallStatusLabel,
	} from "$lib/model/messaging/video-calls";
	import type { VideoCallMessage } from "$lib/model/messaging/messages";
	import { messageRef } from "./context";

	let { message }: { message: VideoCallMessage } = $props();

	const ref = messageRef();

	// A call that connected reads as a call; one that did not reads as the
	// reason it did not, so the two want different icons.
	const answered = $derived(videoCallOutcome(message) === "answered");
</script>

<div
	class="flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-2 text-caption text-muted-foreground"
	{@attach ref}
>
	{#if answered}
		<VideoCameraIcon class="size-4 shrink-0" />
	{:else}
		<PhoneSlashIcon class="size-4 shrink-0" />
	{/if}
	{videoCallStatusLabel(message)}
</div>
