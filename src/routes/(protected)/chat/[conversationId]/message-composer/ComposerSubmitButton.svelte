<script>
	import { PaperPlaneRightIcon } from "phosphor-svelte";

	import { isSoftKeyboardVisible } from "$lib/platform/android-native-bridge";
	import { getMessageComposerContext } from "./message-composer-context.svelte";
	import PrimaryComposerButton from "./PrimaryComposerButton.svelte";

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<!-- Sending must not cost the keyboard, and not only for looks: focusout drops
     --keyboard-inset, the composer slides down into the space the keys had, and
     the button is out from under the finger before the tap resolves into a
     click. That is the tap that appears to only dismiss the keyboard and has to
     be made a second time.

     Two levers, because neither covers both platforms. WebKit ignores
     preventDefault on a touch-derived pointerdown, but it does still dispatch
     mousedown, and after touchend — so cancelling that holds the focus without
     disturbing the tap sequence the click comes from. Android honours the
     pointerdown, and only wants it while the IME is actually up. -->
<PrimaryComposerButton
	type="submit"
	aria-label="Send message"
	{disabled}
	onpointerdown={(event) => {
		if (isSoftKeyboardVisible() === true) event.preventDefault();
	}}
	onmousedown={(event) => event.preventDefault()}
>
	{#snippet icon({ ...props })}
		<PaperPlaneRightIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
