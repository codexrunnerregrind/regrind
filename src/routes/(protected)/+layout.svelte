<script lang="ts">
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";
	import { notifications } from "$lib/notifications/notifications.svelte";

	let { data, children }: import("./$types").LayoutProps = $props();

	$effect(() => {
		const ourProfileId = data.ourProfileId;
		void notifications.start(ourProfileId);
		return () => {
			void notifications.stop();
		};
	});
</script>

{@render children()}
<CommandCenter />
