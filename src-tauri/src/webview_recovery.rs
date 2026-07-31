//! Recovering a WKWebView whose web content process died while we were away.
//!
//! On iOS (and macOS) the page runs in a separate web content process, and iOS
//! reclaims memory by jettisoning that process while the app sits in the
//! background. WKWebView does not recover on its own; the documented cure is to
//! reload.
//!
//! The catch is *when*. The process is jettisoned while we are backgrounded, so
//! `webViewWebContentProcessDidTerminate` reaches us while we are backgrounded
//! too, and a reload issued then cannot bring a content process back — WebKit
//! will not start one for an app that isn't on screen. So on iOS the callback
//! only records the death and the reload waits for the foreground.

use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "ios")]
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri::{Runtime, Webview};

/// WKWebView told us the content process died; reload at the next opportunity.
static CONTENT_PROCESS_DEAD: AtomicBool = AtomicBool::new(false);

/// `webViewWebContentProcessDidTerminate`.
pub fn on_content_process_terminated<R: Runtime>(webview: &Webview<R>) {
	tracing::warn!(webview = webview.label(), "web content process terminated");
	CONTENT_PROCESS_DEAD.store(true, Ordering::SeqCst);

	// On the desktop the app is on screen when this fires, so a reload works
	// right now — and macOS has no foreground event to defer it to anyway.
	#[cfg(target_os = "macos")]
	{
		CONTENT_PROCESS_DEAD.store(false, Ordering::SeqCst);
		if let Err(e) = webview.reload() {
			tracing::error!("webview reload failed: {e}");
		}
	}
}

/// A page load means this webview is running our code again, whatever was wrong.
pub fn on_page_load() {
	CONTENT_PROCESS_DEAD.store(false, Ordering::SeqCst);
}

/// `applicationWillEnterForeground`, the first moment a reload can actually
/// bring the content process back. iOS only — macOS reloads on the spot.
#[cfg(target_os = "ios")]
pub fn on_resumed<R: Runtime>(app: &AppHandle<R>) {
	if !CONTENT_PROCESS_DEAD.swap(false, Ordering::SeqCst) {
		return;
	}
	let Some(webview) = main_webview(app) else {
		return;
	};
	tracing::warn!(
		"reloading webview: content process died while backgrounded"
	);
	if let Err(e) = webview.reload() {
		tracing::error!("webview reload failed: {e}");
	}
}

#[cfg(target_os = "ios")]
fn main_webview<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
	app.get_webview_window("main")
		.or_else(|| app.webview_windows().into_values().next())
}
