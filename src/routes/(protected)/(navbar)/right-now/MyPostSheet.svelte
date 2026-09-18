<script lang="ts">
	import { CameraIcon, ClockIcon, HouseIcon, XIcon } from "phosphor-svelte";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { uploadRightNowMedia } from "$lib/api/right-now";
	import { PhotoEditQueue } from "$lib/components/media/photo-edit-queue.svelte";
	import PhotoEditorDrawer from "$lib/components/media/PhotoEditorDrawer.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Spinner } from "$lib/components/ui/spinner";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import { Textarea } from "$lib/components/ui/textarea";
	import {
		RIGHT_NOW_TEXT_LIMIT,
		type RightNowPostMedia,
	} from "$lib/model/right-now/post";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
	import { pickMedia } from "$lib/platform/media-picker";
	import { myRightNowPost } from "$lib/right-now/my-post-state.svelte";
	import { postTimeLeft } from "$lib/right-now/post-expiry";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import { getNow } from "$lib/util/now";
	import { morphClose, morphOpen } from "./post-morph";

	let {
		open = $bindable(),
		pill = null,
	}: { open: boolean; pill?: HTMLElement | null } = $props();

	let panel = $state<HTMLElement | null>(null);
	let morphing = false;

	// The panel only exists while the drawer is up, and vaul keeps it around for
	// its own exit, so the closing morph still has something to hand off from.
	$effect(() => {
		const surface = panel;
		if (open && surface !== null && pill !== null && !morphing) {
			morphing = true;
			morphOpen(pill, surface);
		} else if (!open && morphing) {
			morphing = false;
			if (surface !== null && pill !== null) morphClose(pill, surface);
		}
	});

	const post = $derived(myRightNowPost.post);
	const editing = $derived(post !== null);

	let text = $state("");
	let hosting = $state(false);
	let media = $state<RightNowPostMedia[]>([]);
	let photoUrl = $state<string | null>(null);
	let uploading = $state(false);
	let removing = $state(false);
	const edits = new PhotoEditQueue();

	// Seeded when the sheet opens and never again, so a background refresh of the
	// post cannot overwrite what is being typed. The post's own photo is not
	// carried in: the API answers with media we cannot turn back into an id to
	// re-send, so editing starts from no photo rather than a broken one.
	$effect(() => {
		if (!open) return;
		const current = untrack(() => myRightNowPost.post);
		text = current?.activeText ?? "";
		hosting = current?.hosting ?? false;
		media = [];
		photoUrl = null;
	});

	$effect(() => {
		if (!open) return;
		const onBackGesture = () => {
			open = false;
			return false;
		};
		backGestureEventHandlers.add(onBackGesture);
		return () => {
			backGestureEventHandlers.delete(onBackGesture);
		};
	});

	// Ticks on its own, so a sheet left open does not keep claiming an hour left.
	const timeLeft = $derived(
		postTimeLeft({ expiration: post?.expiration, nowMs: getNow() }),
	);

	const tooLong = $derived(text.length > RIGHT_NOW_TEXT_LIMIT);
	const busy = $derived(myRightNowPost.busy || uploading || removing);

	async function addPhoto() {
		if (edits.current !== null) return;
		let picked;
		try {
			picked = await pickMedia("image");
		} catch (error) {
			console.error(error);
			toast.error("Couldn't open the photo picker");
			return;
		}
		if (picked === null) return;
		try {
			// One pick, so the walk is one photo long: the editor first, then
			// what it was left as.
			for await (const photo of edits.edit([picked])) {
				uploading = true;
				const uploaded = await uploadRightNowMedia(photo);
				media = [{ type: "image_v1", data: { id: uploaded.mediaId } }];
				photoUrl = uploaded.thumbnailUrl;
			}
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Couldn't add that photo", error });
		} finally {
			uploading = false;
		}
	}

	async function submit() {
		if (busy || tooLong) return;
		const draft = { text, hosting, media };
		try {
			if (editing) await myRightNowPost.update(draft);
			else await myRightNowPost.create(draft);
			open = false;
			toast.success(editing ? "Post updated" : "You're up right now");
			// The feed shows our own post among the rest, so it is now out of date.
			rightNowState.refresh();
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: editing ? "Failed to update post" : "Failed to post",
				error,
			});
		}
	}

	async function remove() {
		if (busy) return;
		removing = true;
		try {
			await myRightNowPost.hide();
			open = false;
			toast.success("Post removed");
			rightNowState.refresh();
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to remove post", error });
		} finally {
			removing = false;
		}
	}
</script>

<Drawer.Root bind:open>
	<Drawer.Content
		bind:ref={panel}
		preventOverflowTextSelection={false}
		class="mx-auto max-w-160"
	>
		<!-- Laid out to the Right Now mock: a title row that carries the one number
		     that matters on the right (posts left before there is a post, time left
		     after), then the text, hosting, photo, and one primary action. -->
		<Drawer.Header class="gap-2">
			<div class="flex items-start justify-between gap-3">
				<Drawer.Title>
					{editing ? "Your post" : "Post to Right Now"}
				</Drawer.Title>
				{#if editing && timeLeft !== null}
					<span
						class="flex shrink-0 items-center gap-1.5 rounded-full bg-fuchsia-600/15 px-3 py-1.5 text-caption font-semibold text-fuchsia-600 tabular-nums"
					>
						<ClockIcon class="size-3.5" />
						{timeLeft}
					</span>
				{:else if !editing}
					<span
						class="shrink-0 rounded-full bg-muted px-3 py-1.5 text-caption font-semibold text-muted-foreground tabular-nums"
					>
						{myRightNowPost.remaining} left
					</span>
				{/if}
			</div>
			{#if !editing}
				<!-- The hour is fixed, so this states it rather than offering a
				     duration control the API has no room for. -->
				<Drawer.Description class="text-left">
					People nearby see this for one hour.
				</Drawer.Description>
			{/if}
		</Drawer.Header>
		<div class="flex flex-col gap-4 px-4 pb-2">
			<div class="flex flex-col gap-1.5">
				<Textarea
					aria-label="What you're up for"
					bind:value={text}
					placeholder="What are you up for?"
					aria-invalid={tooLong}
					class="max-h-40 min-h-20 overflow-y-auto rounded-xl"
				/>
				<span
					class={[
						"self-end text-caption tabular-nums",
						{
							"text-destructive": tooLong,
							"text-muted-foreground": !tooLong,
						},
					]}
				>
					{text.length} / {RIGHT_NOW_TEXT_LIMIT}
				</span>
				{#if tooLong}
					<span class="text-caption text-destructive">
						Too long, please shorten
					</span>
				{/if}
			</div>

			<SwitchField
				title="Hosting"
				description="Shows a house on your post."
				bind:checked={hosting}
				disabled={busy}
			>
				{#snippet icon()}
					<HouseIcon weight="fill" class="size-4 text-fuchsia-600" />
				{/snippet}
			</SwitchField>

			{#if photoUrl !== null}
				<div class="flex items-center gap-3">
					<img
						src={photoUrl}
						alt=""
						class="size-16 rounded-xl object-cover"
					/>
					<Button
						variant="ghost"
						size="sm"
						disabled={busy}
						onclick={() => {
							media = [];
							photoUrl = null;
						}}
					>
						<XIcon />
						Remove photo
					</Button>
				</div>
			{:else}
				<!-- Dashed rather than filled: it is an empty slot to drop something
				     into, not an action on a par with posting. -->
				<button
					type="button"
					class="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border p-3 text-start transition-colors disabled:opacity-50 can-hover:hover:bg-muted/40"
					disabled={busy}
					onclick={() => void addPhoto()}
				>
					<span
						class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
					>
						{#if uploading}
							<Spinner class="size-4" />
						{:else}
							<CameraIcon class="size-4" />
						{/if}
					</span>
					<span class="text-row font-medium text-muted-foreground">
						Add a photo
					</span>
				</button>
			{/if}
		</div>
		<Drawer.Footer class="gap-3">
			<Button disabled={busy || tooLong} onclick={() => void submit()}>
				{#if myRightNowPost.busy && !removing}
					<Spinner class="size-4" />
				{:else if hosting}
					<HouseIcon weight="fill" />
				{/if}
				{editing ? "Save changes" : "Post"}
			</Button>
			{#if editing}
				<!-- Plain text, centred, no icon: ending a post should not be the
				     first thing a thumb finds on the way to Save. -->
				<button
					type="button"
					class="cursor-pointer self-center text-row font-semibold text-destructive disabled:opacity-50"
					disabled={busy}
					onclick={() => void remove()}
				>
					{removing ? "Ending…" : "End Right Now"}
				</button>
			{/if}
		</Drawer.Footer>

		<!-- Inside the sheet's own drawer, which is what a nested drawer wants:
		     the sheet stays put behind the editor instead of closing under it. -->
		<PhotoEditorDrawer
			queue={edits}
			title="Add a photo"
			confirmLabel="Use photo"
			busy={uploading}
			nested
		/>
	</Drawer.Content>
</Drawer.Root>
