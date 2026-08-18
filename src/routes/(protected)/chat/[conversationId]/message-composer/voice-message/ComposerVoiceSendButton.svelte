<script lang="ts">
	import { PaperPlaneRightIcon } from "phosphor-svelte";

	import { getMessageComposerContext } from "../message-composer-context.svelte";
	import PrimaryComposerButton from "../PrimaryComposerButton.svelte";

	const { voice, disabled } = $derived(getMessageComposerContext()());
</script>

<!-- A locked recording is nobody's finger's job any more: it ends on a tap. -->
<PrimaryComposerButton
	aria-label="Send voice message"
	disabled={disabled || voice.sending}
	onclick={() => void voice.send()}
>
	{#snippet icon({ ...props })}
		<PaperPlaneRightIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
