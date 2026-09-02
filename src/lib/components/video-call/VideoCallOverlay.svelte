<script lang="ts">
	import {
		CameraRotateIcon,
		MicrophoneIcon,
		MicrophoneSlashIcon,
		PhoneSlashIcon,
		VideoCameraIcon,
		VideoCameraSlashIcon,
	} from "phosphor-svelte";

	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { formatCallDuration } from "$lib/model/messaging/video-calls";
	import { isMobilePlatform } from "$lib/platform/os";
	import { videoCall } from "$lib/video-call/call-state.svelte";

	// Front/back only exists on a phone; a desktop webcam has no camera facing
	// the other way for the switch to find.
	const canSwitchCamera = isMobilePlatform();

	const name = $derived(videoCall.party?.name ?? "Someone");
	const ringing = $derived(
		videoCall.phase === "incoming" || videoCall.phase === "outgoing",
	);

	const controlClass =
		"flex size-14 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md transition active:scale-90";

	// Where the small tile sits, shared by the tile itself and the button that
	// swaps it — the two have to line up exactly.
	const pipClass =
		"absolute right-4 z-10 h-40 w-28 rounded-xl bottom-[calc(8rem+var(--safe-area-bottom))]";
</script>

{#if videoCall.phase !== "idle"}
	<!-- Above every sheet and dialog in the app: a call is the one thing that
	     may not end up behind something else. -->
	<div
		class="fixed inset-0 z-100 flex flex-col items-center bg-black text-white"
	>
		{#if videoCall.phase === "active"}
			<!-- Two tiles that trade places rather than two pairs that appear and
			     disappear: a track plays into one element, and swapping which
			     element it is keeps both streams running through the swap. -->
			{#each [{ local: false }, { local: true }] as tile (tile.local)}
				{@const main = tile.local === videoCall.localIsMain}
				{@const covered = tile.local
					? videoCall.cameraOff
					: videoCall.remoteCameraOff}
				<div
					class={[
						"overflow-hidden bg-neutral-900",
						{
							"absolute inset-0": main,
							[`${pipClass} border border-white/15 shadow-lg`]:
								!main,
						},
					]}
				>
					<div
						class="size-full"
						{@attach (element) => {
							if (tile.local) videoCall.setLocalTile(element);
							else videoCall.setRemoteTile(element);
							return () => {
								if (tile.local) videoCall.setLocalTile(null);
								else videoCall.setRemoteTile(null);
							};
						}}
					></div>
					<!-- A muted camera leaves the last frame frozen on screen,
					     so their face covers it rather than a still of them. -->
					{#if covered}
						<div class="absolute inset-0">
							<UserAvatar
								mediaHash={tile.local
									? videoCall.ownMediaHash
									: (videoCall.party?.mediaHash ?? null)}
								class="size-full"
								size="xl"
							/>
						</div>
					{/if}
				</div>
			{/each}

			<!-- Its own control rather than a click handler on the tile: the
			     tiles are where video plays, and only one of them is ever the
			     small one. -->
			<button
				type="button"
				aria-label="Swap the video tiles"
				class={[pipClass, "z-20"]}
				onclick={() => videoCall.swapTiles()}
			></button>

			<div
				class="absolute top-0 z-20 rounded-full border border-white/15 bg-black/40 px-3 py-1 pt-fixed-header text-caption tabular-nums backdrop-blur-md"
			>
				{formatCallDuration(videoCall.elapsedSeconds)}
			</div>

			{#if canSwitchCamera}
				<button
					type="button"
					aria-label="Switch camera"
					class={[
						"absolute top-2 left-4 z-20 pt-fixed-header",
						controlClass,
					]}
					onclick={() => void videoCall.switchCamera()}
				>
					<CameraRotateIcon size={24} />
				</button>
			{/if}

			<div
				class="relative z-20 mt-auto flex w-full items-center justify-center gap-6 pb-10 pb-fixed-nav"
			>
				<button
					type="button"
					aria-label={videoCall.micMuted
						? "Unmute microphone"
						: "Mute microphone"}
					class={controlClass}
					onclick={() => videoCall.toggleMic()}
				>
					{#if videoCall.micMuted}
						<MicrophoneSlashIcon size={24} />
					{:else}
						<MicrophoneIcon size={24} />
					{/if}
				</button>
				<button
					type="button"
					aria-label="Hang up"
					class="flex size-16 items-center justify-center rounded-full bg-destructive text-white shadow-lg transition active:scale-90"
					onclick={() => void videoCall.hangUp()}
				>
					<PhoneSlashIcon size={28} />
				</button>
				<button
					type="button"
					aria-label={videoCall.cameraOff
						? "Turn camera on"
						: "Turn camera off"}
					class={controlClass}
					onclick={() => videoCall.toggleCamera()}
				>
					{#if videoCall.cameraOff}
						<VideoCameraSlashIcon size={24} />
					{:else}
						<VideoCameraIcon size={24} />
					{/if}
				</button>
			</div>
		{:else}
			<div
				class="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-fixed-nav text-center"
			>
				<div class="relative size-28">
					{#if ringing}
						<span
							class="absolute inset-0 animate-ping rounded-full bg-primary/25"
						></span>
					{/if}
					<UserAvatar
						mediaHash={videoCall.party?.mediaHash ?? null}
						class="relative size-28 overflow-hidden rounded-full border-2 border-primary/40"
						size="lg"
					/>
				</div>
				<div class="text-title font-bold">{name}</div>
				<div class="text-body text-white/70">
					{videoCall.phase === "incoming"
						? "Incoming video call"
						: "Calling…"}
				</div>
				<div class="mt-8 flex items-center gap-8">
					{#if videoCall.phase === "incoming"}
						<button
							type="button"
							aria-label="Answer"
							class="flex size-16 items-center justify-center rounded-full bg-online text-white shadow-lg transition active:scale-90"
							onclick={() => void videoCall.accept()}
						>
							<VideoCameraIcon size={28} />
						</button>
					{/if}
					<button
						type="button"
						aria-label={videoCall.phase === "incoming"
							? "Decline"
							: "Cancel the call"}
						class="flex size-16 items-center justify-center rounded-full bg-destructive text-white shadow-lg transition active:scale-90"
						onclick={() => void videoCall.hangUp()}
					>
						<PhoneSlashIcon size={28} />
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
