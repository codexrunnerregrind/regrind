package org.regrind

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import io.crates.keyring.Keyring
import java.lang.ref.WeakReference
import org.json.JSONObject
import org.regrind.push.PushFirebase
import org.regrind.push.PushHub
import org.regrind.push.PushNotifier

class MainActivity : TauriActivity() {
	private var insetsTop = 0
	private var insetsBottom = 0
	private var insetsLeft = 0
	private var insetsRight = 0
	@Volatile private var imeVisibleState = false
	private var webViewRef: WebView? = null
	private var pendingWebViewWarning: WebViewSupport.Status? = null
	private var shownWebViewWarning = false

	override val handleBackNavigation = false

	private val backGestureCallback = object : OnBackPressedCallback(true) {
		override fun handleOnBackPressed() {
			val webView = webViewRef
			if (webView == null) {
				fallThrough()
				return
			}
			webView.evaluateJavascript(
				"try { window.__AndroidOnBackGesture?.() } catch (error) { console.error(error); true; }"
			) { result ->
				if (result != "false") {
					if (webView.canGoBack()) webView.goBack() else fallThrough()
				}
			}
		}

		private fun fallThrough() {
			isEnabled = false
			onBackPressedDispatcher.onBackPressed()
			isEnabled = true
		}
	}

	inner class InsetsInterface {
		@JavascriptInterface fun top() = insetsTop
		@JavascriptInterface fun bottom() = insetsBottom
		@JavascriptInterface fun left() = insetsLeft
		@JavascriptInterface fun right() = insetsRight
		@JavascriptInterface fun imeVisible() = imeVisibleState
	}

	inner class BackInterface {
		@JavascriptInterface fun moveTaskToBack() {
			runOnUiThread { this@MainActivity.moveTaskToBack(true) }
		}
	}

	// Bridge for the FCM push path: the frontend keeps native suppression state
	// current and syncs the token through it (see push.svelte.ts).
	inner class PushInterface {
		@JavascriptInterface fun setPrefs(messages: Boolean, taps: Boolean) {
			PushHub.messagesEnabled = messages
			PushHub.tapsEnabled = taps
		}

		@JavascriptInterface fun setActiveRoute(route: String?) {
			PushHub.setActiveRoute(route)
		}
	}

	override fun onCreate(savedInstanceState: Bundle?) {
		enableEdgeToEdge()
		Keyring.initializeNdkContext(applicationContext)
		activityRef = WeakReference(this)
		PushFirebase.initialize(this)
		PushFirebase.fetchToken { token -> onFcmTokenRefreshed(token) }
		pendingWebViewWarning = WebViewSupport.current(
			context = this,
			minSupportedMajor = BuildConfig.MIN_SUPPORTED_WEBVIEW_MAJOR,
		).takeIf { it.disposition == WebViewSupport.Disposition.WARNING }
		super.onCreate(savedInstanceState)

		onBackPressedDispatcher.addCallback(this, backGestureCallback)

		WindowInsetsControllerCompat(window, window.decorView).apply {
			isAppearanceLightStatusBars = false
			isAppearanceLightNavigationBars = false
		}
		
		ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
			val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
			val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
			val isImeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
			imeVisibleState = isImeVisible
			val density = resources.displayMetrics.density
			
			insetsTop = (bars.top / density).toInt()
			insetsBottom = if (isImeVisible) 0 else (bars.bottom / density).toInt()
			insetsLeft = (bars.left / density).toInt()
			insetsRight = (bars.right / density).toInt()
			
			val bottomMargin = if (isImeVisible) ime.bottom else 0
			webViewRef?.let { wv ->
				(wv.layoutParams as? ViewGroup.MarginLayoutParams)?.let { params ->
					if (params.bottomMargin != bottomMargin) {
						params.bottomMargin = bottomMargin
						wv.layoutParams = params
					}
				}
			}
			
			webViewRef?.evaluateJavascript("window.__reapplyInsets?.()", null)
			
			ViewCompat.onApplyWindowInsets(view, insets)
		}
	}
	
	override fun onWebViewCreate(webView: WebView) {
		super.onWebViewCreate(webView)
		webViewRef = webView
		webView.settings.setGeolocationEnabled(false)
		webView.addJavascriptInterface(InsetsInterface(), "__AndroidInsets")
		webView.addJavascriptInterface(BackInterface(), "__AndroidBack")
		webView.addJavascriptInterface(PushInterface(), "__RegrindPush")
		latestFcmToken?.let { dispatchFcmToken(it) }
		handlePushIntent(intent)
		maybeWarnAboutWebView()
	}

	override fun onResume() {
		super.onResume()
		PushHub.inForeground = true
		latestFcmToken?.let { dispatchFcmToken(it) }
	}

	override fun onPause() {
		PushHub.inForeground = false
		super.onPause()
	}

	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
		setIntent(intent)
		handlePushIntent(intent)
	}

	// Route the app to the screen a tapped notification points at. The webview
	// may not exist yet on a cold start; onWebViewCreate replays the intent.
	private fun handlePushIntent(intent: Intent?) {
		val route = intent?.getStringExtra(PushNotifier.EXTRA_ROUTE) ?: return
		intent.removeExtra(PushNotifier.EXTRA_ROUTE)
		val webView = webViewRef ?: return
		runOnUiThread {
			webView.evaluateJavascript(
				"window.dispatchEvent(new CustomEvent('regrind:push-open', " +
					"{ detail: { route: ${JSONObject.quote(route)} } }));",
				null,
			)
		}
	}

	private fun dispatchFcmToken(token: String) {
		val webView = webViewRef ?: return
		runOnUiThread {
			webView.evaluateJavascript(
				"window.__REGRIND_FCM_TOKEN = ${JSONObject.quote(token)};" +
					"window.dispatchEvent(new CustomEvent('regrind:fcm-token', " +
					"{ detail: { token: ${JSONObject.quote(token)} } }));",
				null,
			)
		}
	}

	companion object {
		private var activityRef: WeakReference<MainActivity>? = null
		private var latestFcmToken: String? = null

		@JvmStatic
		fun onFcmTokenRefreshed(token: String) {
			latestFcmToken = token
			activityRef?.get()?.dispatchFcmToken(token)
		}
	}

	private fun maybeWarnAboutWebView() {
		val warning = pendingWebViewWarning ?: return
		val webView = webViewRef ?: return
		if (shownWebViewWarning) return
		shownWebViewWarning = true
		webView.visibility = WebView.INVISIBLE

		val view = layoutInflater.inflate(R.layout.dialog_webview_warning, null, false)
		view.findViewById<TextView>(R.id.dialog_message).text = buildWebViewWarningMessage(warning)

		val dialog = MaterialAlertDialogBuilder(this, R.style.ThemeOverlay_OpenGrind_WebViewDialog)
			.setView(view)
			.setCancelable(false)
			.create()

		view.findViewById<MaterialButton>(R.id.button_update).setOnClickListener {
			dialog.dismiss()
			openWebViewUpdate(warning)
			revealWebView()
		}
		view.findViewById<MaterialButton>(R.id.button_continue).setOnClickListener {
			dialog.dismiss()
			revealWebView()
		}

		dialog.show()
	}

	private fun revealWebView() {
		webViewRef?.visibility = WebView.VISIBLE
	}

	private fun buildWebViewWarningMessage(status: WebViewSupport.Status): String {
		val provider = status.packageName ?: "Unknown provider"
		val version = status.versionName ?: "Unknown version"
		return "ReGrind may not display correctly on older Android System WebView " +
			"versions. This build expects WebView ${status.minSupportedMajor} or newer.\n\n" +
			"Detected provider: $provider ($version)"
	}

	private fun openWebViewUpdate(status: WebViewSupport.Status) {
		val packageName = status.packageName
		val intents = buildList {
			if (packageName != null) {
				add(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")))
				add(
					Intent(
						Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
						Uri.parse("package:$packageName"),
					),
				)
			}
			add(Intent(Settings.ACTION_SETTINGS))
		}

		for (intent in intents) {
			try {
				startActivity(intent)
				return
			} catch (_: ActivityNotFoundException) {
			}
		}
	}
}
