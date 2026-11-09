<script lang="ts">
	import DisplayName from "#lib/components/profile/DisplayName.svelte";
	import {
		type PeekProfile,
		profileGestures,
	} from "#lib/components/profile/peek/peek-state.svelte.ts";
	import ProfileStatusIndicator from "#lib/components/profile/ProfileStatusIndicator.svelte";
	import UserAvatar from "#lib/components/profile/UserAvatar.svelte";
	import * as Avatar from "#lib/components/ui/avatar/index.ts";
	import * as Item from "#lib/components/ui/item/index.ts";
	import { longPressHandlers } from "#lib/util/long-press.ts";

	let {
		avatar,
		title,
		onlineUntil = null,
		active,
		selected,
		link,
		onclick = undefined,
		description,
		actions,
		control,
		onToggleSelected,
		onLongPress,
		peek,
	}: {
		avatar: {
			mediaHash: string | null;
			overlay?: import("svelte").Snippet;
			link?: string;
		};
		title: {
			value: string | null;
			fallback?: string;
			badge?: import("svelte").Snippet;
		};
		onlineUntil?: number | null;
		active?: boolean;
		selected?: boolean;
		link: string;
		/** Fires just before `link` navigates. Not wired to the avatar's own link. */
		onclick?: import("svelte/elements").MouseEventHandler<HTMLAnchorElement>;
		description?: import("svelte").Snippet;
		actions?: import("svelte").Snippet;
		control?: import("svelte").Snippet;
		onToggleSelected?: () => void;
		onLongPress?: () => void;
		/** Long-press peek and double-tap-to-tap, unless `onLongPress` is set. */
		peek?: PeekProfile;
	} = $props();

	let row: HTMLElement | null = $state(null);

	// The avatar that is actually laid out; the row shows one of two.
	function peekAnchor(): HTMLElement | null {
		const avatars = row?.querySelectorAll<HTMLElement>(
			"[data-slot='item-media']",
		);
		return (
			[...(avatars ?? [])].find(
				(avatar) => avatar.getBoundingClientRect().width > 0,
			) ?? row
		);
	}

	const longPress = $derived.by(() => {
		if (onLongPress) return longPressHandlers(onLongPress);
		const profile = peek;
		if (!profile) return {};
		return profileGestures(peekAnchor, () => profile) ?? {};
	});
	const linkTabindex = $derived(onToggleSelected ? -1 : undefined);
	const accessibleName = $derived(title.value ?? title.fallback ?? "Someone");
</script>

{#snippet avatarNode()}
	<Item.Media class="relative translate-y-0! rounded-full">
		<Avatar.Root class="size-16 after:border-0">
			<UserAvatar
				mediaHash={avatar.mediaHash}
				class="size-16 rounded-full bg-media-placeholder *:rounded-full"
			/>
		</Avatar.Root>
		{@render avatar.overlay?.()}
	</Item.Media>
{/snippet}
{#snippet contentNode()}
	<Item.Content class="min-w-0 flex-1">
		<Item.Title
			class={[
				"flex w-auto min-w-0 items-center gap-1 truncate",
				{ "text-muted-foreground": !title.value },
			]}
		>
			{@render title.badge?.()}
			<ProfileStatusIndicator {onlineUntil} />
			<DisplayName
				name={title.value}
				fallback={title.fallback}
				class="truncate"
			/>
		</Item.Title>
		{@render description?.()}
	</Item.Content>
	{@render actions?.()}
{/snippet}
<Item.Root
	bind:ref={row}
	variant={active ? "muted" : "default"}
	class={[
		"@container relative flex min-w-24 flex-nowrap items-stretch gap-0 rounded-none p-0",
		{
			"can-hover:hover:bg-muted/40": !selected && !active,
			"outline-2 -outline-offset-2 outline-primary outline-solid":
				selected,
			"[-webkit-touch-callout:none] **:[-webkit-touch-callout:none]":
				!!onLongPress || !!peek,
		},
	]}
	{...longPress}
>
	{#if avatar.link}
		<a
			href={avatar.link}
			aria-label="{accessibleName}'s profile"
			class="flex items-center rounded-l-2xl py-3 ps-4 pe-3 @max-row:hidden"
			tabindex={linkTabindex}
		>
			{@render avatarNode()}
		</a>
		<a
			href={link}
			{onclick}
			class="content relative gap-0.5 py-3 pe-4 after:pointer-events-none after:absolute after:right-4 after:bottom-0 after:left-0 after:border-b after:border-border/60 @max-row:hidden!"
			tabindex={linkTabindex}
		>
			{@render contentNode()}
		</a>
		<a
			href={link}
			{onclick}
			aria-label={accessibleName}
			class="min-w-24 rounded-2xl @row:hidden"
			tabindex={linkTabindex}
		>
			{@render avatarNode()}
		</a>
	{:else}
		<a
			href={link}
			{onclick}
			class="content relative gap-3 overflow-clip py-3 ps-4 pe-4 after:pointer-events-none after:absolute after:right-4 after:bottom-0 after:left-list-inset after:border-b after:border-border/60"
			tabindex={linkTabindex}
		>
			{@render avatarNode()}
			{@render contentNode()}
		</a>
	{/if}
	{#if control}
		<div class="flex shrink-0 items-center ps-3 pe-4">
			{@render control()}
		</div>
	{/if}
	{#if selected}
		<div
			class="pointer-events-none absolute -inset-px z-1 rounded-[inherit] bg-primary/20"
		></div>
	{/if}
	{#if onToggleSelected}
		<button
			type="button"
			class="absolute inset-0 z-2 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
			aria-pressed={selected ?? false}
			aria-label={accessibleName}
			onclick={onToggleSelected}
		></button>
	{/if}
</Item.Root>

<style lang="postcss">
	@reference "$layout";

	.content {
		@apply flex min-w-0 flex-1 items-center self-stretch;
	}
</style>
