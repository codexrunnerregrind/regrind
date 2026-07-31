//! Recovering a WKWebView whose web content process died while we were away.
//!
//! On iOS (and macOS) the page runs in a separate web content process. While the
//! app sits in the background iOS reclaims memory by jettisoning that process.
//! WKWebView does not recover on its own: the last rendered frame stays on
//! screen, but nothing scrolls, nothing responds to touch, and the only cure is
//! force-quitting — the "UI freezes after the app has been in the background"
//! symptom.
//!
//! WKWebView reports this through `webViewWebContentProcessDidTerminate`, and the
//! documented cure is to reload. The catch is *when*: the process is jettisoned
//! while we are backgrounded, so the delegate fires while we are backgrounded
//! too, and a reload issued then cannot bring a content process back — WebKit
//! will not spin one up for an app that isn't on screen. The reload quietly
//! achieves nothing and the view is still dead when the user returns.
//!
//! So we reload on the way back in instead, and we don't rely solely on the
//! delegate to tell us we need to: on every foreground we ask the page to prove
//! it is alive, and reload if it doesn't answer. That covers a dead content
//! process whether or not the termination callback ever reached us.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime, Webview, WebviewWindow};

/// WKWebView told us the content process died; reload at the next opportunity.
static CONTENT_PROCESS_DEAD: AtomicBool = AtomicBool::new(false);
/// Set once the page has loaded, so we don't probe a webview that was never
/// alive in the first place (the cold-launch `Resumed`).
static PAGE_HAS_LOADED: AtomicBool = AtomicBool::new(false);
/// Nonce of the liveness probe we're waiting on, or 0 when none is outstanding.
static PENDING_PROBE: AtomicU64 = AtomicU64::new(0);
static NEXT_PROBE: AtomicU64 = AtomicU64::new(1);

/// How long the page gets to answer one liveness probe, and how many probes go
/// unanswered before we call it dead. Deliberately slack: WebKit only thaws the
/// page around `didBecomeActive`, which trails the foreground event we fire on,
/// and reloading a healthy page throws away the user's place in the app. A real
/// content-process death is normally caught by the flag above and reloaded
/// instantly, so this backstop can afford to be slow and sure.
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);
const PROBE_ATTEMPTS: u32 = 2;

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

/// A page load settles both flags: whatever was wrong, this webview is running
/// our code again.
pub fn on_page_load() {
	PAGE_HAS_LOADED.store(true, Ordering::SeqCst);
	CONTENT_PROCESS_DEAD.store(false, Ordering::SeqCst);
	PENDING_PROBE.store(0, Ordering::SeqCst);
}

/// Answer to a liveness probe, via the `webview_pong` command.
pub fn on_pong(nonce: u64) {
	let _ = PENDING_PROBE.compare_exchange(
		nonce,
		0,
		Ordering::SeqCst,
		Ordering::SeqCst,
	);
}

/// `applicationWillEnterForeground`. Reload if we know the content process is
/// gone; otherwise make the page prove it.
pub fn on_resumed<R: Runtime>(app: &AppHandle<R>) {
	let Some(webview) = main_webview(app) else {
		return;
	};

	if CONTENT_PROCESS_DEAD.swap(false, Ordering::SeqCst) {
		reload(
			&webview,
			"content process was terminated while backgrounded",
		);
		return;
	}

	if !PAGE_HAS_LOADED.load(Ordering::SeqCst) {
		return;
	}

	probe(app.clone(), webview);
}

fn main_webview<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
	app.get_webview_window("main")
		.or_else(|| app.webview_windows().into_values().next())
}

fn reload<R: Runtime>(webview: &WebviewWindow<R>, why: &str) {
	tracing::warn!("reloading webview: {why}");
	if let Err(e) = webview.reload() {
		tracing::error!("webview reload failed: {e}");
	}
}

/// Ask the page to call `webview_pong` back, and reload if it never does. A dead
/// content process never runs the script, so silence is the signal.
fn probe<R: Runtime>(app: AppHandle<R>, webview: WebviewWindow<R>) {
	tauri::async_runtime::spawn(async move {
		for _ in 0..PROBE_ATTEMPTS {
			let nonce = NEXT_PROBE.fetch_add(1, Ordering::SeqCst);
			PENDING_PROBE.store(nonce, Ordering::SeqCst);

			if let Err(e) = webview.eval(format!(
				"try {{ window.__TAURI_INTERNALS__.invoke('webview_pong', \
				 {{ nonce: {nonce} }}).catch(function () {{}}) }} catch (e) {{}}"
			)) {
				// We couldn't even queue the script. That says nothing about the
				// content process, so don't reload on it.
				tracing::error!("liveness probe could not be dispatched: {e}");
				PENDING_PROBE.store(0, Ordering::SeqCst);
				return;
			}

			tokio::time::sleep(PROBE_TIMEOUT).await;

			// Answered — or superseded by a probe from a later foreground, which
			// is that probe's business, not ours.
			if PENDING_PROBE.load(Ordering::SeqCst) != nonce {
				return;
			}
			tracing::warn!("liveness probe {nonce} went unanswered");
		}

		PENDING_PROBE.store(0, Ordering::SeqCst);
		// Re-resolve rather than reusing the captured handle: the webview may
		// have been torn down while we slept.
		if let Some(webview) = main_webview(&app) {
			reload(&webview, "page stopped answering liveness probes");
		}
	});
}

#[tauri::command]
pub async fn webview_pong(nonce: u64) {
	on_pong(nonce);
}
