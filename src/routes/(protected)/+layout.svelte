<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import { page } from "$app/state";

	import { reportAccountProfile } from "$lib/api/accounts.svelte";
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";
	import MediaDropOverlay from "$lib/components/shared/MediaDropOverlay.svelte";
	import VideoCallOverlay from "$lib/components/video-call/VideoCallOverlay.svelte";
	import { notifications } from "$lib/notifications/notifications.svelte";
	import { push } from "$lib/notifications/push.svelte";
	import { listenForKeyboardMedia } from "$lib/platform/keyboard-media.svelte";
	import { listenForMedia } from "$lib/platform/media-intake.svelte";
	import { startOnlineHeartbeat } from "$lib/presence/online-heartbeat";
	import { guardDeletedPages } from "$lib/util/deleted-pages";
	import { retryBrokenMediaWhenOnline } from "$lib/util/media-retry-signals";
	import { videoCall } from "$lib/video-call/call-state.svelte";

	let { data, children }: import("./$types").LayoutProps = $props();

	$effect(() => {
		const ourProfileId = data.ourProfileId;
		void notifications.start(ourProfileId);
		// Android-only FCM push; a no-op on other platforms.
		push.start(ourProfileId);
		// The switcher shows a name and a face per account, both read from the
		// account's own profile. Doing it here rather than only on a switch means
		// an account learns them the first time it is simply used, including the
		// one already signed in when the app opens.
		void reportAccountProfile(ourProfileId);
		// A call can arrive on any screen, so it is listened for here rather
		// than in the conversation that would have placed it.
		void videoCall.start(ourProfileId);
		return () => {
			void notifications.stop();
			push.stop();
			void videoCall.stop();
		};
	});

	// Let native push suppress banners for the screen already on show.
	afterNavigate(() => push.setActiveRoute(page.url.pathname));

	guardDeletedPages();

	$effect(() => startOnlineHeartbeat());
	$effect(() => retryBrokenMediaWhenOnline());
	$effect(() => listenForMedia());
	$effect(() => listenForKeyboardMedia());
</script>

{@render children()}
<CommandCenter />
<VideoCallOverlay />
<MediaDropOverlay />
