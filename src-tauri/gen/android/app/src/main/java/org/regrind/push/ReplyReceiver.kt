package org.regrind.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import org.regrind.MainActivity

// Inline reply from a chat notification. Sending needs the signed-in session,
// which lives in the webview, so this only works while it is alive.
class ReplyReceiver : BroadcastReceiver() {
	override fun onReceive(context: Context, intent: Intent) {
		val key = intent.getStringExtra(PushNotifier.EXTRA_KEY) ?: return
		val conversationId = intent.getStringExtra(PushNotifier.EXTRA_CONVERSATION_ID) ?: return
		val text = RemoteInput.getResultsFromIntent(intent)
			?.getCharSequence(PushNotifier.KEY_REPLY_TEXT)
			?.toString()
			?.trim()
			.orEmpty()
		if (text.isEmpty()) return
		if (!MainActivity.deliverNotificationReply(key, conversationId, text)) {
			PushNotifier.markReplied(context, key, text, sent = false)
		}
	}
}
