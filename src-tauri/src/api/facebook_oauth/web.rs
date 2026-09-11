use std::sync::Arc;

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use crate::error::AppError;

use crate::api::oauth::{
	close_windows, is_cancel_url, new_nonce, next_window_label,
	without_secrets, CANCELED,
};

use super::dialog::{
	dialog_url, is_allowed_target, is_redirect_url, result_from_redirect,
	HANDOFF_REFUSED,
};
use super::FacebookOauthBridge;

const WINDOW_LABEL_PREFIX: &str = "facebook-oauth";

const FLOW_TIMEOUT: std::time::Duration =
	std::time::Duration::from_secs(10 * 60);

/// iOS asks for no size: a window built without one covers the screen, and the
/// app is what shows around anything smaller.
#[cfg(desktop)]
const WINDOW_INNER_SIZE: (f64, f64) = (600.0, 700.0);
#[cfg(target_os = "android")]
const WINDOW_INNER_SIZE: (f64, f64) = (500.0, 720.0);

#[cfg(desktop)]
const DESKTOP_USER_AGENT: &str =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
	 AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

pub async fn fetch_access_token(
	app: &AppHandle,
	bridge: Arc<FacebookOauthBridge>,
) -> Result<String, AppError> {
	// Before the slot is claimed: a stale window's own close handler would
	// otherwise cancel the flow that is just starting.
	close_windows(app, WINDOW_LABEL_PREFIX);

	let rx = bridge.begin()?;
	run_flow(app, &bridge, rx).await.inspect_err(|_| {
		bridge.abort();
	})
}

async fn run_flow(
	app: &AppHandle,
	bridge: &Arc<FacebookOauthBridge>,
	rx: oneshot::Receiver<Result<String, String>>,
) -> Result<String, AppError> {
	let state = new_nonce();
	let label = next_window_label(WINDOW_LABEL_PREFIX);
	let bridge_for_nav = bridge.clone();
	let state_for_nav = state.clone();

	#[allow(unused_mut)]
	let mut builder = WebviewWindowBuilder::new(
		app,
		&label,
		WebviewUrl::External(dialog_url(&state)?),
	)
	.title("Sign in with Facebook")
	.incognito(true)
	.general_autofill_enabled(false)
	.on_navigation(move |url| {
		if is_cancel_url(url) {
			bridge_for_nav.fulfill(Err(CANCELED.to_owned()));
			return false;
		}
		if !is_allowed_target(url) {
			tracing::warn!("[fb-oauth] refused {}", without_secrets(url));
			bridge_for_nav.fulfill(Err(HANDOFF_REFUSED.to_owned()));
			return false;
		}
		if !is_redirect_url(url) {
			tracing::debug!("[fb-oauth] navigating {}", without_secrets(url));
			return true;
		}
		if let Some(result) = result_from_redirect(url, &state_for_nav) {
			bridge_for_nav.fulfill(result);
		}
		false
	});

	#[cfg(desktop)]
	{
		builder = builder.user_agent(DESKTOP_USER_AGENT);
	}

	#[cfg(not(target_os = "ios"))]
	{
		let (width, height) = WINDOW_INNER_SIZE;
		builder = builder.inner_size(width, height);
	}

	#[cfg(target_os = "ios")]
	{
		builder = builder
			.initialization_script(crate::api::oauth::close_button_script());
	}

	#[cfg(target_os = "android")]
	{
		builder = builder
			.activity_name("FacebookOauthActivity")
			.created_by_activity_name(main_activity_name(app)?);
	}

	#[cfg(target_os = "windows")]
	{
		builder = builder
			.data_directory(crate::api::oauth::oauth_data_dir(app, &state)?);
	}

	let window = builder.build().map_err(|e| {
		AppError::Http(format!("failed to open sign-in window: {e}"))
	})?;

	let bridge_for_close = bridge.clone();
	window.on_window_event(move |event| {
		if matches!(
			event,
			tauri::WindowEvent::CloseRequested { .. }
				| tauri::WindowEvent::Destroyed
		) {
			bridge_for_close.fulfill(Err(CANCELED.to_owned()));
		}
	});

	let result = match tokio::time::timeout(FLOW_TIMEOUT, rx).await {
		Ok(Ok(result)) => result,
		Ok(Err(_)) => {
			dismiss_window(app).await;
			return Err(AppError::Auth(
				"sign-in flow ended unexpectedly".into(),
			));
		}
		Err(_) => Err("Sign-in timed out".to_owned()),
	};

	dismiss_window(app).await;

	result.map_err(AppError::Auth)
}

/// tao matches this against `Activity.getLocalClassName()`, which is the bare
/// `MainActivity` only while the applicationId equals the Kotlin package: a
/// debug build's `.dev` suffix makes it fully qualified instead. Asking the
/// window itself spells it the way tao stored it, so both builds match; a miss
/// is silent, since the failure reaches an unset `log` and the flow just hangs.
#[cfg(target_os = "android")]
fn main_activity_name(app: &AppHandle) -> Result<String, AppError> {
	use tauri::Manager;

	const MAIN_WINDOW_LABEL: &str = "main";

	app.get_webview_window(MAIN_WINDOW_LABEL)
		.ok_or_else(|| AppError::Http("the main window is gone".into()))?
		.activity_name()
		.map_err(|e| AppError::Http(format!("no activity name: {e}")))
}

async fn dismiss_window(app: &AppHandle) {
	close_windows(app, WINDOW_LABEL_PREFIX);
	#[cfg(target_os = "android")]
	super::android::dismiss(app).await;
}
