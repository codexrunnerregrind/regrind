import { createContext } from "svelte";

import type { MessageDraft } from "$lib/model/messaging/messages";
import type { VoiceMessageComposer } from "./voice-message/voice-message-composer.svelte";

export const [getMessageComposerContext, setMessageComposerContext] =
	createContext<
		() => {
			disabled: boolean;
			sendMessages: (drafts: MessageDraft[]) => void | Promise<void>;
			voice: VoiceMessageComposer;
		}
	>();
