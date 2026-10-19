package org.regrind

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.TextView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import java.lang.ref.WeakReference
import org.json.JSONObject
import org.regrind.push.NotificationPermission
import org.regrind.push.PushFirebase
import org.regrind.push.PushHub
import org.regrind.push.PushNotifier

class MainActivity : TauriActivity() {
	private data class WebInsets(
		val top: Double,
		val bottom: Double,
		val left: Double,
		val right: Double,
		val imeVisible: Boolean,
	) {
		fun toJavascript() = "{ top: $top, bottom: $bottom, left: $left, right: $right, ime: $imeVisible }"
	}

	@Volatile private var webInsets = WebInsets(top = 0.0, bottom = 0.0, left = 0.0, right = 0.0, imeVisible = false)
	private var sentWebInsets: WebInsets? = null
	@Volatile private var backGestureProgress = 0f
	private var webViewRef: WebView? = null
	private var pendingWebViewWarning: WebViewSupport.Status? = null
	private var shownWebViewWarning = false
	private val mainHandler = Handler(Looper.getMainLooper())
	private var pendingPushRoute: String? = null
	private val hoverRepair = WebViewHoverRepair(context = this, webView = { webViewRef })

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
		@JavascriptInterface fun top() = webInsets.top
		@JavascriptInterface fun bottom() = webInsets.bottom
		@JavascriptInterface fun left() = webInsets.left
		@JavascriptInterface fun right() = webInsets.right
		@JavascriptInterface fun imeVisible() = webInsets.imeVisible
	}

	private val backProgressCallback = object : OnBackPressedCallback(true) {
		override fun handleOnBackStarted(backEvent: BackEventCompat) {
			backGestureProgress = 0f
			webViewRef?.evaluateJavascript("window.__AndroidOnBackGestureStart?.()", null)
		}

		override fun handleOnBackProgressed(backEvent: BackEventCompat) {
			backGestureProgress = backEvent.progress
		}

		override fun handleOnBackCancelled() {
			backGestureProgress = 0f
			webViewRef?.evaluateJavascript("window.__AndroidOnBackGestureCancel?.()", null)
		}

		override fun handleOnBackPressed() {
			isEnabled = false
			onBackPressedDispatcher.onBackPressed()
			isEnabled = true
		}
	}

	inner class BackInterface {
		@JavascriptInterface fun gestureProgress() = backGestureProgress

		@JavascriptInterface fun moveTaskToBack() {
			runOnUiThread { this@MainActivity.moveTaskToBack(true) }
		}
	}

	// Bridge for the FCM push path: the frontend keeps native suppression state
	// current and syncs the token through it (see push.svelte.ts).
	inner class PushInterface {
		@JavascriptInterface fun setPrefs(messages: Boolean, taps: Boolean) {
			PushHub.setPrefs(this@MainActivity, messages, taps)
		}

		@JavascriptInterface fun setActiveRoute(route: String?) {
			PushHub.setActiveRoute(route)
		}

		/** The OS's own notification state, as JSON — see NotificationPermission. */
		@JavascriptInterface fun permissionState(): String =
			NotificationPermission.state(this@MainActivity).toString()

		@JavascriptInterface fun requestPermission() {
			runOnUiThread { NotificationPermission.request(this@MainActivity) }
		}

		@JavascriptInterface fun openNotificationSettings() {
			runOnUiThread { NotificationPermission.openSettings(this@MainActivity) }
		}

		/** Re-ask FCM for a token, for the settings screen's retry. */
		@JavascriptInterface fun refreshToken() {
			PushFirebase.initialize(this@MainActivity)
			fetchFcmToken()
		}
	}

	override fun onCreate(savedInstanceState: Bundle?) {
		enableEdgeToEdge()
		activityRef = WeakReference(this)
		PushHub.loadPrefs(applicationContext)
		PushFirebase.initialize(this)
		fetchFcmToken()
		pendingWebViewWarning = WebViewSupport.current(
			context = this,
			minSupportedMajor = BuildConfig.MIN_SUPPORTED_WEBVIEW_MAJOR,
		).takeIf { it.disposition == WebViewSupport.Disposition.WARNING }
		super.onCreate(savedInstanceState)

		onBackPressedDispatcher.addCallback(this, backGestureCallback)
		ensureNotificationPermission()

		WindowInsetsControllerCompat(window, window.decorView).apply {
			isAppearanceLightStatusBars = false
			isAppearanceLightNavigationBars = false
		}
		
		ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(android.R.id.content)) { view, insets ->
			val bars = insets.getInsets(
				WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
			)
			val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
			val isImeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
			val density = resources.displayMetrics.density.toDouble()
			
			val nextInsets = WebInsets(
				top = bars.top / density,
				bottom = if (isImeVisible) 0.0 else bars.bottom / density,
				left = bars.left / density,
				right = bars.right / density,
				imeVisible = isImeVisible,
			)
			webInsets = nextInsets
			
			val bottomMargin = if (isImeVisible) ime.bottom else 0
			webViewRef?.let { wv ->
				(wv.layoutParams as? ViewGroup.MarginLayoutParams)?.let { params ->
					if (params.bottomMargin != bottomMargin) {
						params.bottomMargin = bottomMargin
						wv.layoutParams = params
					}
				}
			}
			
			val webView = webViewRef
			if (webView != null && nextInsets != sentWebInsets) {
				sentWebInsets = nextInsets
				webView.evaluateJavascript("window.__reapplyInsets?.(${nextInsets.toJavascript()})", null)
			}
			
			ViewCompat.onApplyWindowInsets(view, insets)
		}
	}
	
	// Nothing else asks for this on Android — the push path posts notifications
	// natively rather than through the Tauri plugin — and without the grant
	// API 33+ drops every one of them silently. Once Android has stopped
	// honouring the request the settings screen takes over, offering the system
	// settings instead; re-asking here would only burn the last refusal.
	private fun ensureNotificationPermission() {
		if (!NotificationPermission.canPrompt(this)) return
		NotificationPermission.request(this)
	}

	override fun onRequestPermissionsResult(
		requestCode: Int,
		permissions: Array<out String>,
		grantResults: IntArray,
	) {
		super.onRequestPermissionsResult(requestCode, permissions, grantResults)
		if (requestCode == NotificationPermission.REQUEST_CODE) dispatchNotificationPermission()
	}

	// The state can change without us: the prompt, or a trip to the system
	// settings we come back from. Tell the frontend either way so a toggle it
	// greyed out does not stay that way.
	private fun dispatchNotificationPermission() {
		val webView = webViewRef ?: return
		val state = NotificationPermission.state(this).toString()
		// Same guard as the token dispatch: before the app document is loaded
		// there is nothing listening, and the event is not for a foreign page.
		val script =
			"(function(){" +
				"if (!$IS_APP_DOCUMENT) return;" +
				"window.dispatchEvent(new CustomEvent('regrind:notification-permission'," +
				" { detail: $state }));" +
				"})();"
		runOnUiThread { webView.evaluateJavascript(script, null) }
	}

	override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
		hoverRepair.observe(event)
		return super.dispatchGenericMotionEvent(event)
	}

	override fun dispatchTouchEvent(event: MotionEvent): Boolean {
		hoverRepair.observe(event)
		return super.dispatchTouchEvent(event)
	}

	override fun onWebViewCreate(webView: WebView) {
		super.onWebViewCreate(webView)
		webViewRef = webView
		webView.settings.setGeolocationEnabled(false)
		webView.isHapticFeedbackEnabled = false
		webView.addJavascriptInterface(InsetsInterface(), "__AndroidInsets")
		webView.addJavascriptInterface(BackInterface(), "__AndroidBack")
		webView.addJavascriptInterface(PushInterface(), "__RegrindPush")
		// After Tauri's AppPlugin adds its back callback: only the last one added gets the gesture progress.
		backProgressCallback.remove()
		onBackPressedDispatcher.addCallback(this, backProgressCallback)
		latestFcmToken?.let { dispatchFcmToken(it) }
		tokenUnavailable?.let { dispatchFcmTokenUnavailable(it) }
		// A route captured while there was no webview to deliver it to; runs
		// before handlePushIntent so the two cannot both start a chain.
		flushPushRoute(0)
		handlePushIntent(intent)
		maybeWarnAboutWebView()
	}

	override fun onResume() {
		super.onResume()
		PushHub.inForeground = true
		latestFcmToken?.let { dispatchFcmToken(it) }
		tokenUnavailable?.let { dispatchFcmTokenUnavailable(it) }
		dispatchNotificationPermission()
	}

	override fun onPause() {
		PushHub.inForeground = false
		PushHub.clearActiveRoute()
		super.onPause()
	}

	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
		setIntent(intent)
		handlePushIntent(intent)
	}

	// Route the app to the screen a tapped notification points at.
	private fun handlePushIntent(intent: Intent?) {
		val route = intent?.getStringExtra(PushNotifier.EXTRA_ROUTE) ?: return
		intent.removeExtra(PushNotifier.EXTRA_ROUTE)
		pendingPushRoute = route
		flushPushRoute(0)
	}

	// On a cold start the webview exists but has not navigated to the app yet,
	// so dispatching straight away fired the event into a blank document and the
	// tap only ever opened the grid. Hold the route, wait for the real document,
	// and leave it on the window too — `push.start` runs after sign-in, which
	// can be later still.
	private fun flushPushRoute(attempt: Int) {
		val route = pendingPushRoute ?: return
		val webView = webViewRef ?: return
		val quoted = JSONObject.quote(route)
		val script =
			"(function(){" +
				"if (!$IS_APP_DOCUMENT) return 'retry';" +
				"var r = $quoted;" +
				"window.__REGRIND_PUSH_ROUTE = r;" +
				"window.dispatchEvent(new CustomEvent('regrind:push-open', { detail: { route: r } }));" +
				"return 'ok';" +
				"})();"
		runOnUiThread {
			webView.evaluateJavascript(script) { result ->
				if (result?.contains("ok") == true) {
					pendingPushRoute = null
				} else if (attempt < FCM_DISPATCH_ATTEMPTS) {
					mainHandler.postDelayed(
						{ flushPushRoute(attempt + 1) },
						FCM_DISPATCH_RETRY_MS,
					)
				}
			}
		}
	}

	private fun fetchFcmToken() {
		PushFirebase.fetchToken(
			onToken = { token -> onFcmTokenRefreshed(token) },
			onUnavailable = { reason ->
				tokenUnavailable = reason
				dispatchFcmTokenUnavailable(reason)
			},
		)
	}

	// Without this the frontend cannot tell "no token yet" from "there will
	// never be a token": push registration simply never happened and the
	// settings screen stayed silent about it.
	private fun dispatchFcmTokenUnavailable(reason: String, attempt: Int = 0) {
		val webView = webViewRef ?: return
		val quoted = JSONObject.quote(reason)
		val script =
			"(function(){" +
				"if (!$IS_APP_DOCUMENT) return 'retry';" +
				"var r = $quoted;" +
				"window.__REGRIND_FCM_UNAVAILABLE = r;" +
				"window.dispatchEvent(new CustomEvent('regrind:fcm-token-error'," +
				" { detail: { reason: r } }));" +
				"return 'ok';" +
				"})();"
		runOnUiThread {
			webView.evaluateJavascript(script) { result ->
				if (result?.contains("retry") == true && attempt < FCM_DISPATCH_ATTEMPTS) {
					mainHandler.postDelayed(
						{ dispatchFcmTokenUnavailable(reason, attempt + 1) },
						FCM_DISPATCH_RETRY_MS,
					)
				}
			}
		}
	}

	// The token usually arrives before the webview has navigated to the app, so
	// injecting blind loses it: the global is wiped by the page load and no
	// listener exists yet. Wait for the real document, then stash the token in
	// localStorage as well so the frontend can pick it up whenever it signs in.
	private fun dispatchFcmToken(token: String, attempt: Int = 0) {
		val webView = webViewRef ?: return
		val quoted = JSONObject.quote(token)
		val script =
			"(function(){" +
				"if (!$IS_APP_DOCUMENT) return 'retry';" +
				"var t = $quoted;" +
				"try { localStorage.setItem('regrind:fcm-token', t); } catch (e) { return 'retry'; }" +
				"window.__REGRIND_FCM_TOKEN = t;" +
				"window.dispatchEvent(new CustomEvent('regrind:fcm-token', { detail: { token: t } }));" +
				"return 'ok';" +
				"})();"
		runOnUiThread {
			webView.evaluateJavascript(script) { result ->
				if (result?.contains("retry") == true && attempt < FCM_DISPATCH_ATTEMPTS) {
					mainHandler.postDelayed(
						{ dispatchFcmToken(token, attempt + 1) },
						FCM_DISPATCH_RETRY_MS,
					)
				}
			}
		}
	}

	companion object {
		private const val FCM_DISPATCH_ATTEMPTS = 25
		private const val FCM_DISPATCH_RETRY_MS = 400L
		// Release builds serve the app from app.opengrind.org (see app_origin.rs).
		private const val IS_APP_DOCUMENT =
			"(location.hostname === 'app.opengrind.org' || String(location.href).indexOf('localhost') !== -1)"

		private var activityRef: WeakReference<MainActivity>? = null
		private var latestFcmToken: String? = null
		private var tokenUnavailable: String? = null

		@JvmStatic
		fun onFcmTokenRefreshed(token: String) {
			latestFcmToken = token
			tokenUnavailable = null
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
