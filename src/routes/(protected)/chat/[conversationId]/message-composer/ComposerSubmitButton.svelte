<script>
	import { PaperPlaneRightIcon } from "phosphor-svelte";

	import { isSoftKeyboardVisible } from "$lib/platform/android-native-bridge";
	import { keepKeyboard } from "./keep-keyboard";
	import { getMessageComposerContext } from "./message-composer-context.svelte";
	import PrimaryComposerButton from "./PrimaryComposerButton.svelte";

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<!-- Sending must not cost the keyboard: see keepKeyboard for what focusout
     does to the composer's geometry mid-tap. The pointerdown half is gated to
     Android with the IME actually up, which is the only place it does
     anything. -->
<PrimaryComposerButton
	type="submit"
	aria-label="Send message"
	{disabled}
	onpointerdown={(event) => {
		if (isSoftKeyboardVisible() === true) event.preventDefault();
	}}
	onmousedown={keepKeyboard}
>
	{#snippet icon({ ...props })}
		<PaperPlaneRightIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
