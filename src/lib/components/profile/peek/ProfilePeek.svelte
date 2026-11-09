<script lang="ts">
	import { goto } from "$app/navigation";
	import ChatCircleIcon from "phosphor-svelte/lib/ChatCircleIcon";
	import ProhibitIcon from "phosphor-svelte/lib/ProhibitIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";
	import { untrack } from "svelte";

	import { getConversationMessages } from "#lib/api/messaging/messages.ts";
	import DistanceFormatted from "#lib/components/profile/DistanceFormatted.svelte";
	import ProfileRightNowIndicator from "#lib/components/profile/ProfileRightNowIndicator.svelte";
	import ProfileStatusIndicator from "#lib/components/profile/ProfileStatusIndicator.svelte";
	import { TAP_BURST_MS } from "#lib/components/profile/TapBurst.svelte";
	import TapIcon from "#lib/components/profile/TapIcon.svelte";
	import UserAvatar from "#lib/components/profile/UserAvatar.svelte";
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import { hapticImpact, hapticSelection } from "#lib/haptics.ts";
	import { TapType } from "#lib/model/interest/taps.ts";
	import {
		previewFromMessage,
		previewLabel,
	} from "#lib/model/messaging/message-preview.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import { formatTimeAgoShort } from "#lib/util/format-time.ts";
	import { profileMediaUrl } from "#lib/util/media.ts";
	import { reducedMotion } from "#lib/util/reduced-motion.ts";
	import { bounce, enter, settled, SPRING } from "./peek-motion";
	import {
		conversationIdWith,
		openProfileFrom,
		type PeekProfile,
		profilePeek,
		quickBlock,
		quickFavorite,
		quickTap,
	} from "./peek-state.svelte";
	import PeekStats from "./PeekStats.svelte";

	let {
		anchor,
		profile,
		ourProfileId,
		tapSent,
		onClose,
		children,
	}: {
		anchor: HTMLElement;
		profile: PeekProfile;
		ourProfileId: number;
		tapSent: boolean;
		onClose: () => void;
		children?: import("svelte").Snippet;
	} = $props();

	const OPEN_MS = 480;
	const CLOSE_MS = 280;
	const CARD_RADIUS = 28;
	const CHAT_HEIGHT = 196;
	const CHAT_LINES = 6;
	const CHAT_MASK = "linear-gradient(to bottom, transparent, black 40px)";

	const width = Math.round(Math.min(window.innerWidth - 40, 380));
	const photoHeight = Math.round(
		Math.max(
			140,
			Math.min(width * 0.78, window.innerHeight - CHAT_HEIGHT - 280),
		),
	);

	let dialog: HTMLDialogElement | null = $state(null);
	let card: HTMLElement | null = $state(null);
	let chatPanel: HTMLElement | null = $state(null);
	let scrim: HTMLElement | null = $state(null);
	let actions: HTMLElement | null = $state(null);
	let star: HTMLElement | null = $state(null);
	let fullLoaded = $state(false);
	let closing = false;

	let favorite = $state(untrack(() => profile.isFavorite));
	// Some lists don't know; the loaded profile does, unless already toggled.
	let favoriteTouched = false;
	let tapped = $state(untrack(() => tapSent));
	let tapping = $state(false);

	const noteText = $derived(profile.note?.trim() ?? "");
	const conversationId = untrack(() =>
		conversationIdWith(profile.profileId, ourProfileId),
	);

	type Line = { id: string; mine: boolean; text: string; at: number };
	let chat = $state<
		| { status: "loading" }
		| { status: "ready"; lines: Line[] }
		| { status: "empty" }
	>({ status: "loading" });

	// A plain GET of the history: read receipts are a separate call, so a peek
	// never marks anything read.
	$effect(() => {
		let live = true;
		getConversationMessages({ conversationId })
			.then(({ messages }) => {
				if (!live) return;
				const lines = messages
					.toSorted((a, b) => a.timestamp - b.timestamp)
					.slice(-CHAT_LINES)
					.map((message) => ({
						id: message.messageId,
						mine: message.senderId === ourProfileId,
						text:
							previewLabel(previewFromMessage(message)) ??
							"Message",
						at: message.timestamp,
					}));
				chat =
					lines.length > 0
						? { status: "ready", lines }
						: { status: "empty" };
			})
			.catch(() => {
				if (live) chat = { status: "empty" };
			});
		return () => {
			live = false;
		};
	});

	dismissOnBackGesture({ active: () => true, dismiss: () => void close() });

	function tileRadius(): number {
		return parseFloat(getComputedStyle(anchor).borderTopLeftRadius) || 0;
	}

	// Grows the card out of the tile: its top-left lands on the tile's and its
	// width matches, so the photo appears to lift straight off the grid.
	function flipFrom(from: DOMRect, to: DOMRect) {
		const scale = from.width / to.width;
		return {
			transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`,
			borderRadius: `${tileRadius() / scale}px`,
		};
	}

	$effect(() => {
		if (!dialog || !card || !scrim || !actions || !chatPanel) return;
		dialog.showModal();
		// Focus the dialog itself: autofocus would ring the first action.
		dialog.focus({ preventScroll: true });
		anchor.style.visibility = "hidden";

		const motion = !reducedMotion.current;
		scrim.animate?.([{ opacity: 0 }, { opacity: 1 }], {
			duration: motion ? 260 : 150,
			easing: "ease-out",
			fill: "both",
		});
		const from = anchor.getBoundingClientRect();
		card.animate?.(
			motion && from.width > 0
				? [
						{
							...flipFrom(from, card.getBoundingClientRect()),
							opacity: 1,
						},
						{ transform: "none", borderRadius: `${CARD_RADIUS}px` },
					]
				: [{ opacity: 0 }, { opacity: 1 }],
			{
				duration: motion ? OPEN_MS : 150,
				easing: motion ? SPRING : "ease-out",
				fill: "both",
			},
		);
		chatPanel.animate?.(
			[
				{ opacity: 0, transform: "translateY(-10px)" },
				{ opacity: 1, transform: "none" },
			],
			{
				duration: motion ? 320 : 150,
				delay: motion ? 160 : 0,
				easing: "ease-out",
				fill: "both",
			},
		);
		[...actions.children].forEach((child, index) => {
			child.animate?.(
				motion
					? [
							{
								opacity: 0,
								transform: "translateY(18px) scale(0.6)",
							},
							{ opacity: 1, transform: "none" },
						]
					: [{ opacity: 0 }, { opacity: 1 }],
				{
					duration: motion ? 420 : 150,
					delay: motion ? 200 + index * 45 : 0,
					easing: motion ? SPRING : "ease-out",
					fill: "both",
				},
			);
		});

		return () => {
			anchor.style.visibility = "";
		};
	});

	async function close(after?: () => void): Promise<void> {
		if (closing || !dialog || !card || !scrim || !actions) return;
		closing = true;
		const motion = !reducedMotion.current;
		const options = {
			duration: motion ? CLOSE_MS : 120,
			easing: "cubic-bezier(0.4, 0, 0.2, 1)",
			fill: "both" as const,
		};
		const from = anchor.isConnected ? anchor.getBoundingClientRect() : null;
		const to = card.getBoundingClientRect();
		const animations = [
			scrim.animate?.([{ opacity: 1 }, { opacity: 0 }], options),
			chatPanel?.animate?.([{ opacity: 1 }, { opacity: 0 }], {
				...options,
				duration: options.duration * 0.5,
			}),
			card.animate?.(
				motion && from !== null && from.width > 0
					? [
							{
								transform: "none",
								borderRadius: `${CARD_RADIUS}px`,
							},
							flipFrom(from, to),
						]
					: [
							{ opacity: 1, transform: "none" },
							{ opacity: 0, transform: "scale(0.9)" },
						],
				options,
			),
			actions.animate?.(
				[
					{ opacity: 1, transform: "none" },
					{ opacity: 0, transform: "translateY(12px)" },
				],
				{ ...options, duration: options.duration * 0.6 },
			),
		];
		await settled(animations);
		anchor.style.visibility = "";
		dialog.close();
		onClose();
		after?.();
	}

	async function tap() {
		if (tapped || tapping) return;
		tapping = true;
		tapped = true;
		hapticImpact("medium");
		const rect = card?.getBoundingClientRect();
		if (rect) profilePeek.celebrate(rect);
		const ok = await quickTap(profile);
		tapping = false;
		if (!ok) {
			tapped = false;
			return;
		}
		setTimeout(() => void close(), TAP_BURST_MS);
	}

	async function toggleFavorite() {
		const next = !favorite;
		favorite = next;
		favoriteTouched = true;
		hapticSelection();
		bounce(star);
		if (!(await quickFavorite(profile.profileId, next))) favorite = !next;
	}
</script>

{#snippet action(
	label: string,
	onclick: () => void,
	icon: import("svelte").Snippet,
	tone: string,
	disabled: boolean,
)}
	<button
		type="button"
		role="menuitem"
		{disabled}
		class="group flex w-16 flex-col items-center gap-2 outline-none disabled:cursor-default"
		{onclick}
	>
		<span
			class={[
				"flex size-15 items-center justify-center rounded-full bg-white/14 text-white shadow-lg ring-1 ring-white/15 backdrop-filter-(--bd-chip) transition-[scale,background-color] duration-150 group-focus-visible:ring-2 group-focus-visible:ring-ring group-active:scale-90 group-active:bg-white/25",
				tone,
			]}
		>
			{@render icon()}
		</span>
		<span class="text-xs font-medium text-white/85">{label}</span>
	</button>
{/snippet}

{#snippet messageIcon()}
	<ChatCircleIcon weight="fill" class="size-7" />
{/snippet}
{#snippet tapIcon()}
	<!-- Line glyph while it can be sent, the emoji once it has been. -->
	{#key tapped}
		<span
			class="flex"
			{@attach (node: HTMLElement) => {
				if (tapped) bounce(node);
			}}
		>
			<TapIcon tapType={TapType.Hot} sent={tapped} class="size-7" />
		</span>
	{/key}
{/snippet}
{#snippet favoriteIcon()}
	<span class="flex" bind:this={star}>
		<StarIcon
			weight={favorite ? "fill" : "bold"}
			class={[
				"size-7 transition-colors",
				{ "text-yellow-400": favorite },
			]}
		/>
	</span>
{/snippet}
{#snippet blockIcon()}
	<ProhibitIcon weight="bold" class="size-7" />
{/snippet}

<dialog
	bind:this={dialog}
	tabindex="-1"
	aria-label={profile.displayName
		? `${profile.displayName}, quick actions`
		: "Quick actions"}
	class="peek fixed inset-0 z-9999 m-0 size-full max-h-none max-w-none bg-transparent p-0 outline-none select-none"
	oncancel={(event) => {
		event.preventDefault();
		void close();
	}}
	oncontextmenu={(event) => event.preventDefault()}
>
	<button
		bind:this={scrim}
		type="button"
		aria-label="Close"
		tabindex="-1"
		class="absolute inset-0 bg-black/55 backdrop-filter-(--bd-panel)"
		onclick={() => void close()}
	></button>

	<div
		class="pointer-events-none relative flex size-full flex-col items-center justify-center gap-6 px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
	>
		<div
			bind:this={card}
			class="pointer-events-auto relative flex origin-top-left flex-col overflow-hidden bg-popover text-popover-foreground shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] ring-1 ring-white/10"
			style:width="{width}px"
			style:border-radius="{CARD_RADIUS}px"
		>
			<button
				type="button"
				aria-label={profile.displayName
					? `Open ${profile.displayName}'s profile`
					: "Open profile"}
				class="relative w-full shrink-0 overflow-hidden bg-media-placeholder outline-none"
				style:height="{photoHeight}px"
				onclick={() =>
					void close(() =>
						openProfileFrom(anchor, profile.profileId),
					)}
			>
				<UserAvatar
					mediaHash={profile.mediaHash}
					class="absolute inset-0 size-full"
					size="xl"
				/>
				{#if profile.mediaHash !== null}
					<div
						class={[
							"absolute inset-0 transition-opacity duration-500",
							{ "opacity-0": !fullLoaded },
						]}
					>
						<MediaImage
							src={profileMediaUrl({
								mediaHash: profile.mediaHash,
								size: "full",
							})}
							class="size-full"
							tone="photo"
							size="xl"
							onload={() => (fullLoaded = true)}
						/>
					</div>
				{/if}

				{#if profile.distance !== undefined && profile.distance !== null}
					<span
						class="absolute top-3.5 right-3.5 rounded-full bg-black/35 px-2.5 py-1 text-xs font-semibold text-white backdrop-filter-(--bd-veil)"
					>
						<DistanceFormatted distance={profile.distance} />
					</span>
				{/if}

				<div
					class="absolute inset-x-0 bottom-0 flex flex-col items-start gap-1 bg-linear-to-t from-black/85 via-black/40 to-transparent px-5 pt-14 pb-4 text-start text-white"
				>
					<div class="flex max-w-full min-w-0 items-center gap-1.5">
						<ProfileStatusIndicator
							onlineUntil={profile.onlineUntil ?? null}
							isVisiting={profile.isVisiting ?? false}
							class="size-2.5"
						/>
						<ProfileRightNowIndicator
							rightNow={profile.rightNow ?? null}
						/>
						<span class="truncate text-2xl/tight font-bold">
							{profile.displayName ?? "Profile"}
						</span>
						{#if (profile.age ?? null) !== null}
							<span
								class="text-2xl/tight font-light text-white/85"
							>
								{profile.age}
							</span>
						{/if}
					</div>
					<PeekStats
						profileId={profile.profileId}
						onProfile={(loaded) => {
							if (!favoriteTouched) favorite = loaded.isFavorite;
							if (loaded.tapped || loaded.tapType !== null)
								tapped = true;
						}}
					/>
					{#if noteText !== ""}
						<span
							class="line-clamp-1 text-sm text-plate-accent italic"
						>
							“{noteText}”
						</span>
					{/if}
				</div>
			</button>

			<button
				bind:this={chatPanel}
				type="button"
				aria-label="Open conversation"
				class="relative flex w-full flex-col justify-end gap-1.5 overflow-hidden px-3.5 pt-3 pb-3.5 text-start outline-none"
				style:height="{CHAT_HEIGHT}px"
				style:mask-image={CHAT_MASK}
				onclick={() =>
					void close(() => void goto(`/chat/${conversationId}`))}
			>
				{#if chat.status === "loading"}
					{#each [{ w: "55%", mine: false }, { w: "40%", mine: true }, { w: "62%", mine: false }] as skeleton, i (i)}
						<span
							class={[
								"h-8 shrink-0 animate-pulse rounded-2xl bg-muted",
								{
									"self-end": skeleton.mine,
									"self-start": !skeleton.mine,
								},
							]}
							style:width={skeleton.w}
						></span>
					{/each}
				{:else if chat.status === "empty"}
					<div
						class="m-auto flex flex-col items-center gap-1 text-center"
						{@attach enter(0)}
					>
						<span class="wave inline-block text-3xl">👋</span>
						<span class="text-sm font-semibold"
							>No messages yet</span
						>
						<span class="text-xs text-muted-foreground"
							>Tap to start a conversation</span
						>
					</div>
				{:else}
					{#each chat.lines as line, index (line.id)}
						<span
							class={[
								"line-clamp-3 max-w-[80%] shrink-0 rounded-2xl px-3 py-1.5 text-sm/normal break-words",
								{
									"self-end rounded-br-md bg-primary text-primary-foreground":
										line.mine,
									"self-start rounded-bl-md bg-muted text-foreground":
										!line.mine,
								},
							]}
							{@attach enter(index)}
						>
							{line.text}
						</span>
					{/each}
					<span
						class="mt-0.5 shrink-0 self-center text-3xs text-muted-foreground"
						{@attach enter(chat.lines.length)}
					>
						{formatTimeAgoShort(
							chat.lines.at(-1)?.at ?? 0,
							Date.now(),
						)}
					</span>
				{/if}
			</button>
		</div>

		<div
			bind:this={actions}
			class="pointer-events-auto flex items-start justify-center gap-5"
			role="menu"
			aria-label="Profile actions"
		>
			{@render action(
				"Message",
				() => void close(() => void goto(`/chat/${conversationId}`)),
				messageIcon,
				"",
				false,
			)}
			{@render action(
				tapped ? "Tapped" : "Tap",
				() => void tap(),
				tapIcon,
				"",
				tapped,
			)}
			{@render action(
				favorite ? "Favorited" : "Favorite",
				() => void toggleFavorite(),
				favoriteIcon,
				"",
				false,
			)}
			{@render action(
				"Block",
				() => void close(() => void quickBlock(profile)),
				blockIcon,
				"text-red-400 bg-red-500/15! ring-red-400/25!",
				false,
			)}
		</div>
	</div>
	<!-- The burst renders in the dialog's top layer, or it would sit behind it. -->
	{@render children?.()}
</dialog>

<style>
	.peek::backdrop {
		background: transparent;
	}

	.wave {
		transform-origin: 70% 80%;
		animation: wave 2.2s ease-in-out 0.4s infinite;
	}

	@keyframes wave {
		0%,
		60%,
		100% {
			rotate: 0deg;
		}
		10%,
		30% {
			rotate: 16deg;
		}
		20%,
		40% {
			rotate: -10deg;
		}
		50% {
			rotate: 10deg;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.wave {
			animation: none;
		}
	}

	:global(:root[data-reduce-motion]) .wave {
		animation: none;
	}
</style>
