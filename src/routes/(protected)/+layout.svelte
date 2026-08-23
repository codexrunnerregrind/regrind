<script lang="ts">
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";
	import { notifications } from "$lib/notifications/notifications.svelte";
	import { startOnlineHeartbeat } from "$lib/presence/online-heartbeat";

	let { data, children }: import("./$types").LayoutProps = $props();

	$effect(() => {
		const ourProfileId = data.ourProfileId;
		void notifications.start(ourProfileId);
		return () => {
			void notifications.stop();
		};
	});

	$effect(() => startOnlineHeartbeat());
</script>

{@render children()}
<CommandCenter />
