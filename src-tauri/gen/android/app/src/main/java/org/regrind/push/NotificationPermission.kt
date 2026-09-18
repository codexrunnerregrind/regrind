package org.regrind.push

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

// The OS half of the notification switches. Nothing used to consult it, so the
// in-app toggles read ON while Android dropped every banner — the state the
// frontend needs to grey them out, and the two ways out of it: the runtime
// prompt while the system will still show one, the app's notification settings
// once it won't.
object NotificationPermission {
	const val REQUEST_CODE = 4711

	private const val TAG = "RegrindPush"
	private const val PREFS = "regrind.push"
	private const val KEY_ASKED = "post-notifications-asked"

	/** What the settings screen renders from. Channel state included: a blocked category is as silent as a blocked app. */
	fun state(activity: Activity): JSONObject {
		// Without the channels the per-category lookups read "missing" rather
		// than the user's actual choice.
		PushNotifier.ensureChannels(activity)
		val enabled = appEnabled(activity)
		return JSONObject()
			.put("appEnabled", enabled)
			.put("messages", enabled && channelEnabled(activity, PushNotifier.CHAT_CHANNEL_ID))
			.put("taps", enabled && channelEnabled(activity, PushNotifier.TAPS_CHANNEL_ID))
			.put("canPrompt", canPrompt(activity))
	}

	fun appEnabled(context: Context): Boolean =
		NotificationManagerCompat.from(context).areNotificationsEnabled()

	/**
	 * Whether the runtime prompt would still appear. False once Android has
	 * stopped honouring the request — two refusals, or notifications turned off
	 * in the system settings — and on API levels that have no prompt at all.
	 * Asking anyway is what made the denial invisible: the call returns denied
	 * without showing anything.
	 */
	fun canPrompt(activity: Activity): Boolean {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false
		if (granted(activity)) return false
		if (!asked(activity)) return true
		return activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
	}

	/** Show the runtime prompt. Caller must have checked [canPrompt]. */
	fun request(activity: Activity) {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
		markAsked(activity)
		try {
			activity.requestPermissions(
				arrayOf(Manifest.permission.POST_NOTIFICATIONS),
				REQUEST_CODE,
			)
		} catch (e: Exception) {
			Log.w(TAG, "notification permission request failed", e)
		}
	}

	/** ReGrind's page in the system notification settings, so a refusal is recoverable. */
	fun openSettings(activity: Activity) {
		val intents = buildList {
			add(
				Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
					.putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName),
			)
			add(
				Intent(
					Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
					Uri.parse("package:${activity.packageName}"),
				),
			)
			add(Intent(Settings.ACTION_SETTINGS))
		}
		for (intent in intents) {
			try {
				activity.startActivity(intent)
				return
			} catch (_: ActivityNotFoundException) {
			}
		}
	}

	private fun granted(context: Context): Boolean {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
		return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
			PackageManager.PERMISSION_GRANTED
	}

	private fun channelEnabled(context: Context, channelId: String): Boolean {
		val channel = NotificationManagerCompat.from(context)
			.getNotificationChannelCompat(channelId) ?: return true
		return channel.importance != NotificationManager.IMPORTANCE_NONE
	}

	// `shouldShowRequestPermissionRationale` is false both before the first ask
	// and after the last one, so the two are only told apart by remembering.
	private fun asked(context: Context): Boolean =
		context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ASKED, false)

	private fun markAsked(context: Context) {
		context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
			.edit()
			.putBoolean(KEY_ASKED, true)
			.apply()
	}
}
