<script lang="ts">
	import { StopIcon } from "phosphor-svelte";

	import { getMessageComposerContext } from "../message-composer-context.svelte";
	import PrimaryComposerButton from "../PrimaryComposerButton.svelte";

	const { voice, disabled } = $derived(getMessageComposerContext()());
</script>

<!-- A locked recording ends here rather than going straight out: the take lands
     in the review row next to it, to be heard before it is sent. -->
<PrimaryComposerButton
	aria-label="Stop recording"
	disabled={disabled || voice.sending}
	onclick={() => void voice.stop()}
>
	{#snippet icon({ ...props })}
		<StopIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
