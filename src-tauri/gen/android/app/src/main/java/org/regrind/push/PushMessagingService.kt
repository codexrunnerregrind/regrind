package org.regrind.push

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import org.regrind.MainActivity

// Receives Grindr's FCM data pushes (delivered whether the app is foregrounded,
// backgrounded, or killed) and renders them via PushNotifier.
class PushMessagingService : FirebaseMessagingService() {
	override fun onMessageReceived(message: RemoteMessage) {
		super.onMessageReceived(message)
		if (message.data.isEmpty()) return
		if (PushNotifier.isMarketingCampaign(message.data)) {
			Log.d("RegrindPush", "ignoring marketing campaign push")
			return
		}
		if (PushNotifier.isRedelivery(message.messageId)) {
			Log.d("RegrindPush", "ignoring redelivered push id=${message.messageId}")
			return
		}
		try {
			PushNotifier.post(this, buildPayload(message.data))
		} catch (e: Exception) {
			Log.e("RegrindPush", "failed to handle push", e)
		}
	}

	override fun onNewToken(token: String) {
		super.onNewToken(token)
		MainActivity.onFcmTokenRefreshed(token)
	}

	private fun buildPayload(data: Map<String, String>): JSONObject {
		val senderName = PushNotifier.resolveSenderName(data)
		val action = data["action"]
		val topBody = data["body"]

		var isTap = false
		var text = "Sent you a message"
		var conversationId = PushNotifier.normalizeNullableString(data["conversationId"])
		var previewImageUrl: String? = null

		if (topBody == "TAP_NOTIFICATION_BODY") {
			isTap = true
			text = "Tapped you"
		} else if (topBody != null && topBody.startsWith("CHAT_")) {
			// A localisation key, not text. It still names the message type, and
			// saying "Album" beats saying "Sent you a message" about one.
			val labelled = PushNotifier.typeFromBodyKey(topBody)
				?.let { PushNotifier.typeLabel(it) }
			if (labelled != null) {
				text = labelled
			} else {
				text = "Sent you a message"
				Log.d("RegrindPush", "unmapped chat body key=$topBody")
			}
		} else if (!topBody.isNullOrBlank()) {
			text = topBody
		}

		// The message blob, when present, carries the conversation id, the
		// per-type body text, and an inline preview. A malformed blob must not
		// drop the whole payload.
		data["message"]?.let { raw ->
			try {
				val json = JSONObject(raw)
				if (json.has("conversationId")) {
					conversationId = PushNotifier.normalizeNullableString(json.optString("conversationId"))
				}
				val type = json.optString("type")
				val body = json.optJSONObject("body")
				if (type == "Text") {
					val plain = json.optString("body")
					val direct = body?.optString("text")?.trim().orEmpty()
					text = direct.ifEmpty { plain.takeIf { it.isNotBlank() && it != "{}" } ?: text }
				} else {
					val labelled = PushNotifier.typeLabel(type)
					if (labelled != null) {
						text = labelled
					} else if (!type.isNullOrBlank()) {
						Log.d("RegrindPush", "unmapped message type=$type")
					}
				}
				// Inline the actual media for the types that carry a still image.
				// ExpiringImage is deliberately left out — a view-once picture
				// shouldn't linger in the shade.
				previewImageUrl = PushNotifier.messagePreviewUrl(body, type)
			} catch (e: Exception) {
				Log.w("RegrindPush", "ignoring malformed message payload", e)
			}
		}

		if (conversationId.isNullOrBlank()) {
			conversationId = PushNotifier.parseConversationAndSenderFromAction(action).first
		}

		return JSONObject().apply {
			put("senderName", senderName)
			put("bodyText", text.trim().ifBlank { "Sent you a message" })
			put("isTap", isTap)
			put("conversationId", conversationId ?: JSONObject.NULL)
			put("senderAvatarUrl", PushNotifier.senderAvatarUrl(data) ?: JSONObject.NULL)
			put("previewImageUrl", previewImageUrl ?: JSONObject.NULL)
		}
	}
}
