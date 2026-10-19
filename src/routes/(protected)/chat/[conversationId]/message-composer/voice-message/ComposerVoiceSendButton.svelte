<script lang="ts">
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";

	import { getMessageComposerContext } from "../message-composer-context.svelte";
	import PrimaryComposerButton from "../PrimaryComposerButton.svelte";

	const { voice, disabled } = $derived(getMessageComposerContext()());
</script>

<!-- The take has been recorded and listened to; this is what puts it in the
     conversation. -->
<PrimaryComposerButton
	aria-label="Send voice message"
	disabled={disabled || voice.sending}
	onclick={() => void voice.sendPending()}
>
	{#snippet icon({ ...props })}
		<PaperPlaneRightIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
