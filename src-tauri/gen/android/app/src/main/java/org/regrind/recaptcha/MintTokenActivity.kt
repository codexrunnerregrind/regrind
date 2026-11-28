package org.regrind.recaptcha

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import com.google.android.recaptcha.Recaptcha
import com.google.android.recaptcha.RecaptchaAction
import com.google.android.recaptcha.RecaptchaException

// Runs in the :recaptcha process, where ReGrindApplication reports Grindr's
// package name: Grindr's site key only accepts tokens minted for that app.
class MintTokenActivity : Activity() {
	private var delivered = false

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		val action = intent.getStringExtra(EXTRA_ACTION) ?: return refuse(ERROR_MINT_FAILED)
		if (!grindrInstalled()) return refuse(ERROR_GRINDR_MISSING)
		try {
			Recaptcha.fetchTaskClient(application, SITE_KEY)
				.onSuccessTask { it.executeTask(RecaptchaAction.custom(action), TIMEOUT_MILLIS) }
				.addOnSuccessListener { deliver(RESULT_OK, Intent().putExtra(EXTRA_TOKEN, it)) }
				.addOnFailureListener { refuse(ERROR_MINT_FAILED, it) }
		} catch (e: RuntimeException) {
			refuse(ERROR_MINT_FAILED, e)
		}
	}

	private fun refuse(error: String, cause: Throwable? = null) {
		cause?.let { Log.w(TAG, "mint failed", it) }
		val data = Intent().putExtra(EXTRA_ERROR, error)
		cause?.let { data.putExtra(EXTRA_ERROR_DETAIL, failureName(it)) }
		deliver(RESULT_CANCELED, data)
	}

	private fun deliver(code: Int, data: Intent) {
		if (delivered || isFinishing) return
		delivered = true
		setResult(code, data)
		finish()
	}

	private fun grindrInstalled(): Boolean = try {
		packageManager.getPackageInfo(GRINDR_PACKAGE, PackageManager.PackageInfoFlags.of(0))
		true
	} catch (e: PackageManager.NameNotFoundException) {
		false
	}

	private fun failureName(error: Throwable): String =
		generateSequence(error) { it.cause }
			.filterIsInstance<RecaptchaException>()
			.firstOrNull()?.errorCode?.name
			?: error.javaClass.simpleName

	companion object {
		const val PROCESS_SUFFIX = ":recaptcha"
		const val GRINDR_PACKAGE = "com.grindrapp.android"
		const val ERROR_MINT_FAILED = "mint-failed"
		const val ERROR_GRINDR_MISSING = "grindr-missing"
		const val EXTRA_ACTION = "action"
		const val EXTRA_TOKEN = "token"
		const val EXTRA_ERROR = "error"
		const val EXTRA_ERROR_DETAIL = "detail"
		private const val TAG = "RecaptchaMint"
		private const val SITE_KEY = "6LeGNmIqAAAAAIi9lNGTgQbFdzohq1cRfQCZW7eB"
		private const val TIMEOUT_MILLIS = 20_000L
	}
}
