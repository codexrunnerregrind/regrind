package org.regrind.push

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import org.regrind.R

// Initialises Firebase against a spoofed context so FCM registers us as the
// official Grindr app, then fetches the push token. Credentials live in
// strings.xml (fcm_*) and are Grindr's own — that is what the sender expects.
object PushFirebase {
	private const val TAG = "RegrindPush"

	private var initialized = false
	private var failure: String? = null

	/** Why push is unavailable on this install, or null while it looks fine. */
	@get:Synchronized
	val unavailableReason: String?
		get() = failure

	@Synchronized
	fun initialize(context: Context) {
		if (initialized || failure != null) return
		try {
			// Read the credentials before Firebase does: a stale inlined R id
			// reads the wrong string and every later failure points elsewhere.
			val appId = context.getString(R.string.fcm_google_app_id)
			val apiKey = context.getString(R.string.fcm_google_api_key)
			val projectId = context.getString(R.string.fcm_project_id)
			val senderId = context.getString(R.string.fcm_gcm_defaultSenderId)
			val invalid = PushCredentials.invalidReason(
				appId,
				apiKey,
				projectId,
				senderId,
				context.getString(R.string.grindr_cert),
			)
			if (invalid != null) {
				fail("$invalid — ${PushCredentials.STALE_RESOURCE_HINT}")
				return
			}

			val spoofed = SpoofedContext(context.applicationContext)
			val options = FirebaseOptions.Builder()
				.setApplicationId(appId)
				.setProjectId(projectId)
				.setApiKey(apiKey)
				.setGcmSenderId(senderId)
				.build()
			if (FirebaseApp.getApps(spoofed).isEmpty()) {
				FirebaseApp.initializeApp(spoofed, options)
			}
			initialized = true
		} catch (e: Throwable) {
			Log.e(TAG, "Firebase init failed; continuing without push", e)
			fail("Firebase init failed: ${e.javaClass.simpleName}")
		}
	}

	/**
	 * Fetch the device token. [onUnavailable] is what the settings screen ends
	 * up showing: a fetch that fails leaves us registered for nothing, and
	 * before this it was a line in logcat and nothing else.
	 */
	fun fetchToken(onToken: (String) -> Unit, onUnavailable: (String) -> Unit) {
		failure?.let {
			onUnavailable(it)
			return
		}
		if (!initialized) {
			onUnavailable("Firebase is not initialised")
			return
		}
		try {
			FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
				val token = task.result
				if (task.isSuccessful && token != null) {
					onToken(token)
				} else {
					Log.w(TAG, "failed to fetch push token", task.exception)
					onUnavailable(
						"token fetch failed: ${task.exception?.javaClass?.simpleName ?: "no token"}",
					)
				}
			}
		} catch (e: Throwable) {
			Log.e(TAG, "FirebaseMessaging unavailable", e)
			onUnavailable("FirebaseMessaging unavailable: ${e.javaClass.simpleName}")
		}
	}

	// A bad credential is not worth retrying; a fetch failure is, so only the
	// former is remembered here.
	@Synchronized
	private fun fail(reason: String) {
		failure = reason
		Log.e(TAG, "push unavailable: $reason")
	}
}
