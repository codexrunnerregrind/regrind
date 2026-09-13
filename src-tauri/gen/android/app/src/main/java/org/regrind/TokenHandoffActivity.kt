package org.regrind

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.SystemClock
import org.regrind.googleoauth.HandoffEvents
import org.regrind.googleoauth.TokenHandoff

class TokenHandoffActivity : Activity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)

		val token = if (isTrustedCaller()) {
			intent?.getStringExtra(EXTRA_TOKEN).orEmpty()
		} else {
			""
		}
		if (token.isEmpty()) {
			setResult(RESULT_CANCELED)
			finish()
			return
		}

		TokenHandoff.offer(token, SystemClock.elapsedRealtime())
		HandoffEvents.notifyPending()
		setResult(RESULT_OK)
		startActivity(
			Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
		)
		finish()
	}

	private fun isTrustedCaller(): Boolean {
		val caller = callingPackage ?: return false
		if (caller != COMPANION_PACKAGE) return false
		return packageManager.checkSignatures(caller, packageName) ==
			PackageManager.SIGNATURE_MATCH
	}

	private companion object {
		const val COMPANION_PACKAGE = "org.regrind.google_oauth"
		const val EXTRA_TOKEN = "org.regrind.google_oauth.extra.TOKEN"
	}
}
