use serde::Serialize;
use tauri::plugin::mobile::PluginInvokeError;
use tauri::plugin::PluginHandle;
use tauri::{AppHandle, Manager, Wry};

use crate::api::oauth::companion_failure;
use crate::error::AppError;

pub struct AndroidGoogleOauth {
	pub handle: PluginHandle<Wry>,
}

#[derive(serde::Deserialize)]
struct TokenResponse {
	token: String,
}

pub async fn fetch_companion_token(
	app: &AppHandle,
) -> Result<String, AppError> {
	let handle = app.state::<AndroidGoogleOauth>().handle.clone();
	let response: TokenResponse = handle
		.run_mobile_plugin_async("getToken", ())
		.await
		.map_err(map_plugin_error)?;
	Ok(response.token)
}

fn map_plugin_error(error: PluginInvokeError) -> AppError {
	companion_failure(match &error {
		PluginInvokeError::InvokeRejected(response) => {
			response.message.as_deref()
		}
		_ => None,
	})
}

#[derive(serde::Deserialize)]
struct PendingResponse {
	pending: bool,
}

#[derive(serde::Deserialize)]
struct HandoffResponse {
	#[serde(default)]
	token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchRequest {
	on_event: tauri::ipc::Channel<HandoffSignal>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HandoffSignal {
	pub pending: bool,
}

fn plugin(app: &AppHandle) -> Option<PluginHandle<Wry>> {
	app.try_state::<AndroidGoogleOauth>()
		.map(|state| state.handle.clone())
}

pub fn handoff_pending(app: &AppHandle) -> bool {
	plugin(app)
		.and_then(|handle| {
			handle
				.run_mobile_plugin::<PendingResponse>("handoffPending", ())
				.ok()
		})
		.is_some_and(|response| response.pending)
}

pub fn take_handoff(app: &AppHandle) -> Option<String> {
	plugin(app)?
		.run_mobile_plugin::<HandoffResponse>("takeHandoff", ())
		.ok()?
		.token
		.filter(|token| !token.is_empty())
}

pub fn discard_handoff(app: &AppHandle) {
	if let Some(handle) = plugin(app) {
		let _ =
			handle.run_mobile_plugin::<serde_json::Value>("discardHandoff", ());
	}
}

pub fn watch_handoff(
	app: &AppHandle,
	on_event: tauri::ipc::Channel<HandoffSignal>,
) -> Result<(), AppError> {
	plugin(app)
		.ok_or_else(|| {
			AppError::Auth("google oauth plugin is not registered".into())
		})?
		.run_mobile_plugin::<serde_json::Value>(
			"watchHandoff",
			WatchRequest { on_event },
		)
		.map(|_| ())
		.map_err(|e| AppError::Auth(e.to_string()))
}
