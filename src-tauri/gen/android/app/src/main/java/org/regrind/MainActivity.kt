package org.regrind

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
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
	private val mainHandler = Handler(Looper.getMainLooper())
	private var pendingPushRoute: String? = null

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
		ensureNotificationPermission()

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
	
	// Nothing else asks for this on Android — the push path posts notifications
	// natively rather than through the Tauri plugin — and without the grant
	// API 33+ drops every one of them silently.
	private fun ensureNotificationPermission() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
		val permission = Manifest.permission.POST_NOTIFICATIONS
		if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) return
		try {
			requestPermissions(arrayOf(permission), REQUEST_POST_NOTIFICATIONS)
		} catch (e: Exception) {
			Log.w("RegrindPush", "notification permission request failed", e)
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
				"if (String(location.href).indexOf('localhost') === -1) return 'retry';" +
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

	// The token usually arrives before the webview has navigated to the app, so
	// injecting blind loses it: the global is wiped by the page load and no
	// listener exists yet. Wait for the real document, then stash the token in
	// localStorage as well so the frontend can pick it up whenever it signs in.
	private fun dispatchFcmToken(token: String, attempt: Int = 0) {
		val webView = webViewRef ?: return
		val quoted = JSONObject.quote(token)
		val script =
			"(function(){" +
				"if (String(location.href).indexOf('localhost') === -1) return 'retry';" +
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
		private const val REQUEST_POST_NOTIFICATIONS = 4711
		private const val FCM_DISPATCH_ATTEMPTS = 25
		private const val FCM_DISPATCH_RETRY_MS = 400L

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
