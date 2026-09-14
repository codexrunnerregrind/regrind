use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use tauri::AppHandle;

use crate::error::AppError;

/// Downloaded media, ready to hand back to the frontend for saving.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedMedia {
	/// `Content-Type` reported by the server, if any.
	pub content_type: Option<String>,
	/// Base64, because raw byte arrays over the Tauri IPC are unreliable.
	/// https://github.com/tauri-apps/tauri/issues/10573
	pub data: String,
}

/// Fetches a chat media URL (image, video or voice note) and returns its bytes. Done in Rust
/// rather than the webview so the request isn't subject to the webview's CORS
/// policy, which the media CDN does not satisfy.
///
/// Through the same client as the `ogmedia` proxy: a client of our own would
/// carry the wrong headers, and on Android its TLS verifier panics unless the
/// platform initialises it.
#[tauri::command]
pub async fn download_media(
	app: AppHandle,
	url: String,
) -> Result<DownloadedMedia, AppError> {
	let fetched = crate::media::fetch_for_download(&app, &url).await.map_err(
		|detail| AppError::Http(format!("Failed to fetch media: {detail}")),
	)?;

	if !(200..300).contains(&fetched.status) {
		return Err(AppError::Http(format!(
			"Failed to fetch media: HTTP {}",
			fetched.status
		)));
	}

	Ok(DownloadedMedia {
		content_type: fetched.content_type,
		data: STANDARD.encode(&fetched.body),
	})
}
