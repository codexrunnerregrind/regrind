package org.regrind.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import android.util.LruCache
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONObject
import org.regrind.MainActivity
import org.regrind.R
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

// Renders an incoming push into a notification. Called from the FCM service on
// the background delivery path. Suppresses when the user has the category off,
// the app is foregrounded (the in-app toast covers that), or they are already
// looking at the relevant screen.
object PushNotifier {
	const val CHAT_CHANNEL_ID = "regrind_chat"
	const val TAPS_CHANNEL_ID = "regrind_taps"
	private const val TAG = "RegrindPush"
	private const val DEDUP_WINDOW_MS = 45_000L

	private val recentKeys = mutableMapOf<String, Long>()
	private val bitmapCache = LruCache<String, Bitmap>(8)

	@Synchronized
	private fun isDuplicate(key: String): Boolean {
		val now = System.currentTimeMillis()
		recentKeys.entries.removeAll { now - it.value >= DEDUP_WINDOW_MS }
		val seen = recentKeys.containsKey(key)
		recentKeys[key] = now
		return seen
	}

	fun post(context: Context, payload: JSONObject) {
		val isTap = payload.optBoolean("isTap", false)
		val title = normalizeSenderName(payload.optString("senderName"))
		val text = payload.optString("bodyText").ifBlank { "Sent you a message" }
		val conversationId = normalizeNullableString(payload.optString("conversationId"))

		if (isTap && !PushHub.tapsEnabled) return
		if (!isTap && !PushHub.messagesEnabled) return
		if (PushHub.inForeground) return
		if (isTap && PushHub.onTapsScreen) return
		if (!isTap && PushHub.isOnConversation(conversationId)) return

		val key = if (isTap) "tap:${title.lowercase()}" else "chat:${conversationId ?: title.lowercase()}"
		if (isDuplicate(key)) {
			Log.d(TAG, "suppressing duplicate key=$key")
			return
		}

		ensureChannels(context)
		val channelId = if (isTap) TAPS_CHANNEL_ID else CHAT_CHANNEL_ID

		val route = if (isTap) "/interest/taps" else conversationId?.let { "/chat/$it" }
		val intent = Intent(context, MainActivity::class.java).apply {
			flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
			if (route != null) putExtra(EXTRA_ROUTE, route)
		}
		val pendingIntent = PendingIntent.getActivity(
			context,
			key.hashCode(),
			intent,
			PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
		)

		// The sender's photo shows as the notification's large icon (and the
		// MessagingStyle bubble avatar); an image/gif message expands to the
		// picture itself. Both are best-effort — a miss falls back to text.
		val avatar = downloadBitmap(normalizeNullableString(payload.optString("senderAvatarUrl")))
		val preview = downloadBitmap(normalizeNullableString(payload.optString("previewImageUrl")))

		val me = Person.Builder().setName("Me").build()
		val senderBuilder = Person.Builder().setName(title)
		if (avatar != null) senderBuilder.setIcon(IconCompat.createWithBitmap(avatar))
		val sender = senderBuilder.build()

		val style: NotificationCompat.Style = when {
			preview != null ->
				NotificationCompat.BigPictureStyle()
					.bigPicture(preview)
					.setBigContentTitle(title)
					.setSummaryText(text)
			isTap -> NotificationCompat.BigTextStyle().bigText(text)
			else ->
				NotificationCompat.MessagingStyle(me)
					.addMessage(text, System.currentTimeMillis(), sender)
		}

		val builder = NotificationCompat.Builder(context, channelId)
			.setSmallIcon(R.drawable.ic_launcher_monochrome)
			.setContentTitle(title)
			.setContentText(text)
			.setCategory(NotificationCompat.CATEGORY_MESSAGE)
			.setPriority(NotificationCompat.PRIORITY_HIGH)
			.setAutoCancel(true)
			.setContentIntent(pendingIntent)
			.setStyle(style)
		if (avatar != null) builder.setLargeIcon(avatar)

		val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
		manager.notify(key, NOTIFICATION_INSTANCE_ID, builder.build())
		Log.d(TAG, "posted notification key=$key route=$route")
	}

	private fun ensureChannels(context: Context) {
		val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
		manager.createNotificationChannel(
			NotificationChannel(CHAT_CHANNEL_ID, "Messages", NotificationManager.IMPORTANCE_HIGH).apply {
				description = "New chat messages"
			},
		)
		manager.createNotificationChannel(
			NotificationChannel(TAPS_CHANNEL_ID, "Taps", NotificationManager.IMPORTANCE_HIGH).apply {
				description = "Incoming taps"
			},
		)
	}

	// Runs on the FCM service's worker thread — blocking I/O is fine here. Any
	// failure (missing url, timeout, decode error) degrades to a text-only
	// notification.
	private fun downloadBitmap(url: String?): Bitmap? {
		if (url.isNullOrBlank()) return null
		bitmapCache.get(url)?.let { return it }
		return try {
			val connection = URL(url).openConnection() as HttpURLConnection
			connection.connectTimeout = 3000
			connection.readTimeout = 3000
			connection.instanceFollowRedirects = true
			connection.connect()
			val bitmap = connection.inputStream.use { BitmapFactory.decodeStream(it) }
			if (bitmap != null) bitmapCache.put(url, bitmap)
			bitmap
		} catch (e: Exception) {
			Log.w(TAG, "failed to load notification image", e)
			null
		}
	}

	private const val CDN_BASE = "https://cdns.grindr.com"

	// The sender's profile photo, from whichever field the push carried it in.
	fun senderAvatarUrl(data: Map<String, String>): String? {
		for (key in listOf("senderProfileImageMediaHash", "profileImageMediaHash", "profileMediaHash")) {
			val hash = normalizeNullableString(data[key])
			if (hash != null && isMediaHash(hash)) return "$CDN_BASE/images/thumb/320x320/$hash"
		}
		data["message"]?.let { raw ->
			try {
				val sender = JSONObject(raw).optJSONObject("sender") ?: return@let
				for (key in listOf("profileImageMediaHash", "profileMediaHash", "mediaHash")) {
					val hash = normalizeNullableString(sender.optString(key))
					if (hash != null && isMediaHash(hash)) return "$CDN_BASE/images/thumb/320x320/$hash"
				}
			} catch (_: Exception) {
			}
		}
		return null
	}

	// The still image to inline for picture/gif/gaymoji messages, or null.
	fun messagePreviewUrl(body: JSONObject?, type: String?): String? {
		if (body == null) return null
		return when (type) {
			"Image" -> {
				val hash = normalizeNullableString(body.optString("imageHash"))
				if (hash != null && isMediaHash(hash)) "$CDN_BASE/images/thumb/480x480/$hash" else null
			}
			"Giphy" -> listOf("previewPath", "stillPath", "urlPath")
				.firstNotNullOfOrNull { httpUrlOrNull(body.optString(it)) }
			"Gaymoji" -> {
				val fragment = normalizeNullableString(body.optString("imageHash"))
				fragment?.let { "$CDN_BASE/grindr/chat/$it" }
			}
			else -> null
		}
	}

	private fun httpUrlOrNull(value: String?): String? {
		val trimmed = value?.trim().orEmpty()
		return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else null
	}

	private fun isMediaHash(value: String): Boolean {
		if (value.length != 32 && value.length != 40 && value.length != 64) return false
		return value.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }
	}

	fun normalizeNullableString(value: String?): String? {
		val trimmed = value?.trim().orEmpty()
		if (trimmed.isEmpty() || trimmed.equals("null", ignoreCase = true)) return null
		return trimmed
	}

	fun normalizeSenderName(value: String?): String {
		val trimmed = value?.trim().orEmpty()
		if (
			trimmed.isEmpty() ||
			trimmed.equals("null", ignoreCase = true) ||
			trimmed.equals("SOMEONE_TITLE", ignoreCase = true)
		) {
			return "Someone"
		}
		return trimmed
	}

	// Grindr's deeplink action carries the ids in its query string, e.g.
	// `grindr://.../chat?id=<conversationId>&senderId=<id>`.
	fun parseConversationAndSenderFromAction(action: String?): Pair<String?, String?> {
		val normalized = normalizeNullableString(action) ?: return null to null
		val query = normalized.substringAfter('?', "")
		if (query.isEmpty()) return null to null

		var conversationId: String? = null
		var senderId: String? = null
		query.split('&').forEach { pair ->
			val key = pair.substringBefore('=', "").trim()
			val raw = pair.substringAfter('=', "").trim()
			val decoded = URLDecoder.decode(raw, StandardCharsets.UTF_8.name())
			when (key) {
				"id" -> conversationId = normalizeNullableString(decoded)
				"senderId" -> senderId = normalizeNullableString(decoded)
			}
		}
		return conversationId to senderId
	}

	const val EXTRA_ROUTE = "regrind_push_route"
	private const val NOTIFICATION_INSTANCE_ID = 1
}
