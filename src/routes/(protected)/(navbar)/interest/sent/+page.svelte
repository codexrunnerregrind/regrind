<script lang="ts">
	import SentTapsList from "./SentTapsList.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<SentTapsList ourProfileId={data.ourProfileId} />
