package org.regrind.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.net.Uri
import android.util.Log
import android.util.LruCache
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.FileProvider
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONObject
import org.regrind.MainActivity
import org.regrind.appicon.AppIconPlugin
import java.io.File
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
	// What a message whose type we cannot name is called.
	const val GENERIC_BODY = "Sent you a message"
	private const val DEDUP_WINDOW_MS = 5 * 60_000L

	private val recentIds = mutableMapOf<String, Long>()
	private val bitmapCache = LruCache<String, Bitmap>(8)

	/**
	 * Guards against FCM handing us the same push twice, which it does. Keyed on
	 * the transport's own message id, so it catches a redelivery and nothing
	 * else.
	 *
	 * This deliberately does not dedupe by conversation. free-grind does, because
	 * there a message can arrive over FCM *and* over the chat WebSocket and
	 * whichever lands first should win. We turned the WebSocket path off on
	 * Android (see the isAndroidPlatform guards in notifications.svelte.ts), so
	 * FCM is the only channel and a conversation-wide window only swallowed the
	 * second and later messages of a live conversation.
	 */
	@Synchronized
	fun isRedelivery(messageId: String?): Boolean {
		val id = normalizeNullableString(messageId) ?: return false
		val now = System.currentTimeMillis()
		recentIds.entries.removeAll { now - it.value >= DEDUP_WINDOW_MS }
		if (recentIds.containsKey(id)) return true
		recentIds[id] = now
		return false
	}

	fun post(context: Context, payload: JSONObject) {
		val isTap = payload.optBoolean("isTap", false)
		val title = normalizeSenderName(payload.optString("senderName"))
		val text = payload.optString("bodyText").ifBlank { GENERIC_BODY }
		val conversationId = normalizeNullableString(payload.optString("conversationId"))

		if (isTap && !PushHub.tapsEnabled) return
		if (!isTap && !PushHub.messagesEnabled) return
		if (PushHub.inForeground) return
		if (isTap && PushHub.onTapsScreen) return
		if (!isTap && PushHub.isOnConversation(conversationId)) return

		// Also the notification's tag, so a further message in the same
		// conversation updates that notification instead of stacking a new one.
		val key = if (isTap) "tap:${title.lowercase()}" else "chat:${conversationId ?: title.lowercase()}"

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

		// The sender's photo is the large icon, the MessagingStyle avatar and,
		// through the conversation shortcut, the icon Android 11+ shows in
		// place of the app's. Best-effort — a miss falls back to text.
		val avatar = downloadBitmap(normalizeNullableString(payload.optString("senderAvatarUrl")))
			?.let(::circleCrop)
		val preview = downloadBitmap(normalizeNullableString(payload.optString("previewImageUrl")))

		val senderBuilder = Person.Builder().setName(title).setKey(key)
		if (avatar != null) senderBuilder.setIcon(IconCompat.createWithBitmap(avatar))
		val sender = senderBuilder.build()
		val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

		val builder = NotificationCompat.Builder(context, channelId)
			.setSmallIcon(AppIconPlugin.notificationIcon(context))
			.setContentTitle(title)
			.setContentText(text)
			.setCategory(NotificationCompat.CATEGORY_MESSAGE)
			.setPriority(NotificationCompat.PRIORITY_HIGH)
			.setAutoCancel(true)
			.setContentIntent(pendingIntent)
		if (avatar != null) builder.setLargeIcon(avatar)

		if (isTap) {
			builder.setStyle(NotificationCompat.BigTextStyle().bigText(text))
		} else {
			// Earlier messages from this chat stay in the notification.
			val style = activeStyle(manager, key) ?: NotificationCompat.MessagingStyle(me())
			val message = NotificationCompat.MessagingStyle.Message(text, System.currentTimeMillis(), sender)
			preview?.let { imageUri(context, it, key) }?.let { message.setData("image/jpeg", it) }
			style.addMessage(message)
			while (style.messages.size > MAX_HISTORY) style.messages.removeAt(0)
			builder.setStyle(style)
			if (publishShortcut(context, key, sender, avatar, route)) builder.setShortcutId(key)
			if (conversationId != null) builder.addAction(replyAction(context, key, conversationId))
		}

		manager.notify(key, NOTIFICATION_INSTANCE_ID, builder.build())
		Log.d(TAG, "posted notification key=$key route=$route")
	}

	/** Appends the user's reply to the chat's notification, or a failure note. */
	fun markReplied(context: Context, key: String, text: String, sent: Boolean) {
		val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
		val active = manager.activeNotifications.firstOrNull {
			it.tag == key && it.id == NOTIFICATION_INSTANCE_ID
		}?.notification ?: return
		val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(active)
			?: NotificationCompat.MessagingStyle(me())
		val line = if (sent) text else "Not sent: $text"
		style.addMessage(line, System.currentTimeMillis(), null as Person?)
		while (style.messages.size > MAX_HISTORY) style.messages.removeAt(0)
		val builder = NotificationCompat.Builder(context, active)
			.setStyle(style)
			.setOnlyAlertOnce(true)
		manager.notify(key, NOTIFICATION_INSTANCE_ID, builder.build())
	}

	private fun me(): Person = Person.Builder().setName("You").build()

	private fun activeStyle(manager: NotificationManager, key: String): NotificationCompat.MessagingStyle? {
		val active = manager.activeNotifications.firstOrNull {
			it.tag == key && it.id == NOTIFICATION_INSTANCE_ID
		} ?: return null
		return NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(active.notification)
	}

	private fun replyAction(context: Context, key: String, conversationId: String): NotificationCompat.Action {
		val input = RemoteInput.Builder(KEY_REPLY_TEXT).setLabel("Message").build()
		val intent = Intent(context, ReplyReceiver::class.java).apply {
			putExtra(EXTRA_KEY, key)
			putExtra(EXTRA_CONVERSATION_ID, conversationId)
		}
		// Mutable: the system writes the typed text into it.
		val pending = PendingIntent.getBroadcast(
			context,
			key.hashCode(),
			intent,
			PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
		)
		return NotificationCompat.Action.Builder(android.R.drawable.ic_menu_send, "Reply", pending)
			.addRemoteInput(input)
			.setAllowGeneratedReplies(true)
			.setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
			.setShowsUserInterface(false)
			.build()
	}

	// A long-lived shortcut makes Android treat the chat as a conversation.
	private fun publishShortcut(
		context: Context,
		key: String,
		sender: Person,
		avatar: Bitmap?,
		route: String?,
	): Boolean = try {
		val intent = Intent(context, MainActivity::class.java).apply {
			action = Intent.ACTION_VIEW
			if (route != null) putExtra(EXTRA_ROUTE, route)
		}
		val icon = avatar?.let { IconCompat.createWithBitmap(it) }
			?: IconCompat.createWithResource(context, context.applicationInfo.icon)
		val shortcut = ShortcutInfoCompat.Builder(context, key)
			.setShortLabel(sender.name ?: "Chat")
			.setPerson(sender)
			.setLongLived(true)
			.setIcon(icon)
			.setIntent(intent)
			.build()
		ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
		true
	} catch (e: Exception) {
		Log.w(TAG, "could not publish conversation shortcut", e)
		false
	}

	private fun circleCrop(source: Bitmap): Bitmap {
		val size = minOf(source.width, source.height)
		val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
		val canvas = Canvas(output)
		val paint = Paint(Paint.ANTI_ALIAS_FLAG)
		canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
		paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
		val left = (source.width - size) / 2f
		val top = (source.height - size) / 2f
		canvas.drawBitmap(source, -left, -top, paint)
		return output
	}

	// MessagingStyle shows an inline image only from a content URI.
	private fun imageUri(context: Context, bitmap: Bitmap, key: String): Uri? = try {
		val dir = File(context.cacheDir, "notification-images").apply { mkdirs() }
		val file = File(dir, "${key.hashCode()}-${System.currentTimeMillis()}.jpg")
		file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, it) }
		dir.listFiles()?.sortedByDescending { it.lastModified() }?.drop(MAX_IMAGES)?.forEach { it.delete() }
		val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
		context.grantUriPermission("com.android.systemui", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
		uri
	} catch (e: Exception) {
		Log.w(TAG, "could not stage notification image", e)
		null
	}

	fun ensureChannels(context: Context) {
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

	// A notification is a sentence about what someone did, not an inbox row's
	// bare label. Mirrors TYPE_BODIES in notifications.svelte.ts, so a push reads
	// the same as the notification iOS posts. Kotlin cannot share the TS map, so
	// changes there belong here too.
	private val TYPE_BODIES = mapOf(
		"Album" to "Shared an album with you",
		"AlbumContentReaction" to "Liked your album picture",
		"AlbumContentReply" to "Replied to your album picture",
		"Audio" to "Sent you a voice message",
		"ExpiringAlbum" to "Shared an expiring album with you",
		"ExpiringAlbumV2" to "Shared an expiring album with you",
		"ExpiringImage" to "Sent you an expiring picture",
		"Gaymoji" to "Sent you a gaymoji",
		"Giphy" to "Sent you a gif",
		"Image" to "Sent you a picture",
		"Location" to "Sent you their location",
		"NonExpiringVideo" to "Sent you a video",
		"PrivateVideo" to "Sent you a video",
		"ProfileLink" to "Sent you a profile",
		"ProfilePhotoReply" to "Replied to your profile picture",
		"RightNowRequest" to "Sent you a Right Now request",
		"Unsent" to "Unsent a message",
		"Video" to "Sent you a video",
		"VideoCall" to "Video called you",
	)

	/** The notification body for a message type, or null for one we do not name yet. */
	fun typeBody(type: String?): String? {
		val name = normalizeNullableString(type) ?: return null
		return TYPE_BODIES[name]
	}

	// The blob-less push variant names the type only inside its localisation
	// key ("CHAT_<something>_NOTIFICATION_BODY"), which we cannot resolve but can
	// read: scan for a type word rather than trying to enumerate every key.
	// Longest tokens first so EXPIRING_IMAGE does not match as IMAGE.
	private val BODY_KEY_TYPES = listOf(
		"EXPIRING_ALBUM" to "ExpiringAlbum",
		"EXPIRING_IMAGE" to "ExpiringImage",
		"EXPIRING_PHOTO" to "ExpiringImage",
		"VIDEO_CALL" to "VideoCall",
		"RIGHT_NOW" to "RightNowRequest",
		"VOICE" to "Audio",
		"AUDIO" to "Audio",
		"ALBUM" to "Album",
		"GAYMOJI" to "Gaymoji",
		"GIPHY" to "Giphy",
		"GIF" to "Giphy",
		"LOCATION" to "Location",
		"PROFILE_PHOTO" to "ProfilePhotoReply",
		"PICTURE" to "Image",
		"PHOTO" to "Image",
		"IMAGE" to "Image",
		"VIDEO" to "Video",
		"PROFILE" to "ProfileLink",
	)

	/** The type a `CHAT_*` body key names, or null when it names none. */
	fun typeFromBodyKey(key: String): String? {
		val upper = key.uppercase()
		return BODY_KEY_TYPES.firstOrNull { upper.contains(it.first) }?.second
	}

	/**
	 * Grindr pushes marketing campaigns down the same channel as chat, tagged
	 * with AWS Pinpoint campaign keys and carrying no conversation. buildPayload
	 * has nothing to make a chat notification out of, so they arrived captioned
	 * "Sent you a message" — an advert wearing a message's clothes. Their text
	 * is localisation keys plus titleArgs/bodyArgs we cannot resolve anyway.
	 *
	 * Pinpoint is the delivery layer for *everything* Grindr sends, chat
	 * included, so the `pinpoint.` prefix alone is not the tell — matching on it
	 * silently dropped real messages. Require a campaign id, and never drop a
	 * push that carries chat or tap content.
	 */
	fun isMarketingCampaign(data: Map<String, String>): Boolean {
		if (data.keys.none { it.startsWith("pinpoint.campaign.") }) return false
		return !carriesChatContent(data)
	}

	private fun carriesChatContent(data: Map<String, String>): Boolean {
		if (normalizeNullableString(data["conversationId"]) != null) return true
		if (normalizeNullableString(data["message"]) != null) return true
		if (normalizeNullableString(data["action"]) != null) return true
		val body = normalizeNullableString(data["body"]) ?: return false
		return body.startsWith("CHAT_") || body == "TAP_NOTIFICATION_BODY"
	}

	private const val CDN_BASE = "https://cdns.grindr.com"

	// The payload shape is inconsistent across message types, so probe the same
	// field names free-grind does rather than the three hashes we started with —
	// a ready-made url first, then any hash we recognise.
	private val AVATAR_URL_KEYS = listOf(
		"senderAvatarUrl",
		"senderProfileImageUrl",
		"profileImageUrl",
		"thumbnailUrl",
		"imageUrl",
	)
	private val AVATAR_HASH_KEYS = listOf(
		"senderProfileImageMediaHash",
		// The spelling the chat WebSocket uses (see ws.svelte.ts) — the push
		// payload turns out to use it too on some variants.
		"senderProfileImageHash",
		"profileImageMediaHash",
		"profileImageHash",
		"profileMediaHash",
		"imageHash",
		"photoHash",
		"mediaHash",
	)

	private val SENDER_NAME_KEYS = listOf(
		"title",
		"senderDisplayName",
		"senderName",
		"displayName",
		"name",
	)

	// Grindr sends a localisation key rather than a name on the generic push
	// variants ("SOMEONE_TITLE"), and the arguments that would fill it in are
	// not something we can render. Treat those as absent and keep looking.
	private val LOCALISATION_KEY = Regex("^[A-Z0-9]+(_[A-Z0-9]+)+$")

	private fun realName(value: String?): String? {
		val trimmed = normalizeNullableString(value) ?: return null
		if (LOCALISATION_KEY.matches(trimmed)) return null
		return trimmed
	}

	/**
	 * The sender's name from whichever field carries it. The old code read
	 * `title ?: senderDisplayName`, which never reached the fallback: `title` is
	 * present-but-placeholder on the variant that needs it, not null, so every
	 * such message showed as "Someone".
	 */
	fun resolveSenderName(data: Map<String, String>): String {
		for (key in SENDER_NAME_KEYS) realName(data[key])?.let { return it }
		var senderKeys: List<String>? = null
		data["message"]?.let { raw ->
			try {
				val sender = JSONObject(raw).optJSONObject("sender") ?: return@let
				for (key in SENDER_NAME_KEYS) realName(sender.optString(key))?.let { return it }
				senderKeys = sender.keys().asSequence().sorted().toList()
			} catch (_: Exception) {
			}
		}
		// Log on every fallback, not just when a blob was present: a tap push
		// carries no blob, so the old placement stayed silent on exactly the
		// case that shows "Someone". Names only, never values.
		Log.d(TAG, "no sender name; keys=${data.keys.sorted()} senderKeys=$senderKeys")
		return "Someone"
	}

	private fun avatarFrom(lookup: (String) -> String?): String? {
		for (key in AVATAR_URL_KEYS) {
			httpUrlOrNull(lookup(key))?.let { return it }
		}
		for (key in AVATAR_HASH_KEYS) {
			val hash = normalizeNullableString(lookup(key))
			if (hash != null && isMediaHash(hash)) {
				return "$CDN_BASE/images/thumb/320x320/$hash"
			}
		}
		return null
	}

	// The sender's profile photo, from whichever field the push carried it in.
	fun senderAvatarUrl(data: Map<String, String>): String? {
		avatarFrom { data[it] }?.let { return it }
		data["message"]?.let { raw ->
			try {
				val sender = JSONObject(raw).optJSONObject("sender") ?: return@let
				avatarFrom { sender.optString(it) }?.let { return it }
			} catch (_: Exception) {
			}
		}
		// Names only, never values — enough to tell which field to add next.
		Log.d(TAG, "no sender avatar in push; keys=${data.keys.sorted()}")
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
	const val EXTRA_KEY = "regrind_push_key"
	const val EXTRA_CONVERSATION_ID = "regrind_push_conversation"
	const val KEY_REPLY_TEXT = "regrind_reply_text"
	private const val NOTIFICATION_INSTANCE_ID = 1
	private const val MAX_HISTORY = 10
	private const val MAX_IMAGES = 20
}
