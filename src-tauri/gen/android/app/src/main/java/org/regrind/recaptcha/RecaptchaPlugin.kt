package org.regrind.recaptcha

import android.app.Activity
import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.regrind.launchForResult

@InvokeArg
internal class MintArgs {
	lateinit var action: String
}

@TauriPlugin
class RecaptchaPlugin(private val activity: Activity) : Plugin(activity) {

	@Command
	fun mintToken(invoke: Invoke) {
		val action = invoke.parseArgs(MintArgs::class.java).action
		val intent = Intent(activity, MintTokenActivity::class.java)
			.putExtra(MintTokenActivity.EXTRA_ACTION, action)
		activity.launchForResult(intent) { result ->
			val data = result.data
			val token = data?.getStringExtra(MintTokenActivity.EXTRA_TOKEN)
			when {
				result.resultCode == Activity.RESULT_OK && !token.isNullOrEmpty() ->
					invoke.resolve(JSObject().apply { put("token", token) })
				result.resultCode == Activity.RESULT_OK -> invoke.reject(ERROR_NO_TOKEN)
				else -> invoke.reject(
					data?.getStringExtra(MintTokenActivity.EXTRA_ERROR) ?: MintTokenActivity.ERROR_MINT_FAILED,
					data?.getStringExtra(MintTokenActivity.EXTRA_ERROR_DETAIL),
				)
			}
		}
	}

	private companion object {
		const val ERROR_NO_TOKEN = "no-token"
	}
}
