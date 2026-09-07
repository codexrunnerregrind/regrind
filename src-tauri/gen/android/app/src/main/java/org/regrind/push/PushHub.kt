package org.regrind.push

// Shared state between the FCM service (which runs with no Activity when the app
// is backgrounded or killed) and MainActivity/the WebView. The frontend keeps
// the preference and active-route fields current through the JS bridge; the
// service reads them to decide whether to post a notification.
object PushHub {
	@Volatile var inForeground: Boolean = false
	@Volatile var messagesEnabled: Boolean = true
	@Volatile var tapsEnabled: Boolean = true

	@Volatile var activeConversationId: String? = null
	@Volatile var onTapsScreen: Boolean = false

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
