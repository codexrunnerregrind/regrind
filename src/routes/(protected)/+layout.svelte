<script lang="ts">
	import { reportAccountProfile } from "$lib/api/accounts.svelte";
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";
	import { notifications } from "$lib/notifications/notifications.svelte";
	import { startOnlineHeartbeat } from "$lib/presence/online-heartbeat";

	let { data, children }: import("./$types").LayoutProps = $props();

	$effect(() => {
		const ourProfileId = data.ourProfileId;
		void notifications.start(ourProfileId);
		// The switcher shows a name and a face per account, both read from the
		// account's own profile. Doing it here rather than only on a switch means
		// an account learns them the first time it is simply used, including the
		// one already signed in when the app opens.
		void reportAccountProfile(ourProfileId);
		return () => {
			void notifications.stop();
		};
	});

	$effect(() => startOnlineHeartbeat());
</script>

{@render children()}
<CommandCenter />
