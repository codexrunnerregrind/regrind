package org.regrind.push

import android.content.Context

// Shared state between the FCM service (which runs with no Activity when the app
// is backgrounded or killed) and MainActivity/the WebView. The frontend keeps
// the preference and active-route fields current through the JS bridge; the
// service reads them to decide whether to post a notification.
object PushHub {
	internal const val PREFS = "regrind.push"
	private const val KEY_MESSAGES = "notify-messages"
	private const val KEY_TAPS = "notify-taps"

	@Volatile var inForeground: Boolean = false
	@Volatile var messagesEnabled: Boolean = true
	@Volatile var tapsEnabled: Boolean = true

	@Volatile var activeConversationId: String? = null
	@Volatile var onTapsScreen: Boolean = false

	// Whether the two flags above are the user's answer rather than the default.
	@Volatile private var prefsKnown: Boolean = false

	/**
	 * Record the user's categories, from the webview.
	 *
	 * Persisted because the delivery path outlives the webview: a push that
	 * starts the process cold has no one to ask, and the defaults said yes to
	 * everything — a category switched off was honoured only while the app
	 * happened to be running, which is the one time push is not needed.
	 */
	fun setPrefs(context: Context, messages: Boolean, taps: Boolean) {
		messagesEnabled = messages
		tapsEnabled = taps
		prefsKnown = true
		context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
			.edit()
			.putBoolean(KEY_MESSAGES, messages)
			.putBoolean(KEY_TAPS, taps)
			.apply()
	}

	/** Seed the categories from disk. A no-op once the webview has spoken. */
	fun loadPrefs(context: Context) {
		if (prefsKnown) return
		val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
		messagesEnabled = prefs.getBoolean(KEY_MESSAGES, true)
		tapsEnabled = prefs.getBoolean(KEY_TAPS, true)
		prefsKnown = true
	}

	fun isOnConversation(conversationId: String?): Boolean =
		conversationId != null && conversationId == activeConversationId

	fun setActiveRoute(route: String?) {
		val path = route?.substringBefore('?')?.substringBefore('#').orEmpty()
		onTapsScreen = path.startsWith("/interest/taps")
		activeConversationId = Regex("^/chat/([^/]+)").find(path)?.groupValues?.get(1)
	}

	// The route only says what the user is looking at while we are foregrounded,
	// and the service consults it only when we are not — so it has to be dropped
	// on the way out. Left set, it silently swallowed every message from the
	// conversation the app was last backgrounded from.
	fun clearActiveRoute() {
		onTapsScreen = false
		activeConversationId = null
	}
}
