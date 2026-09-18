package org.regrind.push

/**
 * Shape checks for the FCM credentials the push spoof registers with.
 *
 * Kotlin inlines `R.string.*` as literal ints, so a class that is not
 * recompiled after a resource is added ahead of one of these keeps asking for
 * the old id and silently reads a *different* string. That happened: two
 * add-on strings landed in front of `grindr_cert` and the certificate lookup
 * started returning the FCM app id, which failed as hex a stack frame later
 * with nothing naming the real cause. Checking the shape turns that into one
 * line that says what to do about it.
 */
object PushCredentials {
	private val APP_ID = Regex("^1:\\d+:android:[0-9a-f]+$")
	private val SENDER_ID = Regex("^\\d+$")
	private val HEX = Regex("^[0-9a-fA-F]+$")

	/**
	 * What a wrong value most likely is. A shifted resource id reads a
	 * neighbouring string, so naming the suspicion saves the next reader the
	 * bytecode dive.
	 */
	const val STALE_RESOURCE_HINT =
		"a string resource was added ahead of these, so the inlined R ids are stale — " +
			"rebuild after clearing app/build/kotlin and app/build/tmp/kotlin-classes"

	/** A reason the credentials cannot be what they claim to be, or null. */
	fun invalidReason(
		appId: String,
		apiKey: String,
		projectId: String,
		senderId: String,
		certHex: String,
	): String? {
		if (!APP_ID.matches(appId)) return "fcm_google_app_id is not an app id: ${redact(appId)}"
		if (apiKey.isBlank()) return "fcm_google_api_key is blank"
		if (projectId.isBlank()) return "fcm_project_id is blank"
		if (!SENDER_ID.matches(senderId)) {
			return "fcm_gcm_defaultSenderId is not numeric: ${redact(senderId)}"
		}
		if (certHex.length < 64 || !HEX.matches(certHex)) {
			return "grindr_cert is not a certificate: ${redact(certHex)}"
		}
		if (certHex.length % 2 != 0) return "grindr_cert hex has an odd length"
		return null
	}

	// Enough to recognise the value, not enough to paste a credential into a log.
	private fun redact(value: String): String {
		val head = value.take(12)
		return if (value.length > 12) "$head… (${value.length} chars)" else head
	}
}
