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
	private var initialized = false

	@Synchronized
	fun initialize(context: Context) {
		if (initialized) return
		try {
			val spoofed = SpoofedContext(context.applicationContext)
			val options = FirebaseOptions.Builder()
				.setApplicationId(context.getString(R.string.fcm_google_app_id))
				.setProjectId(context.getString(R.string.fcm_project_id))
				.setApiKey(context.getString(R.string.fcm_google_api_key))
				.setGcmSenderId(context.getString(R.string.fcm_gcm_defaultSenderId))
				.build()
			if (FirebaseApp.getApps(spoofed).isEmpty()) {
				FirebaseApp.initializeApp(spoofed, options)
			}
			initialized = true
		} catch (e: Throwable) {
			Log.e("RegrindPush", "Firebase init failed; continuing without push", e)
		}
	}

	fun fetchToken(onToken: (String) -> Unit) {
		if (!initialized) return
		try {
			FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
				if (task.isSuccessful) {
					task.result?.let(onToken)
				} else {
					Log.w("RegrindPush", "failed to fetch push token", task.exception)
				}
			}
		} catch (e: Throwable) {
			Log.e("RegrindPush", "FirebaseMessaging unavailable", e)
		}
	}
}
