use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;

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

/// Fetches a chat media URL (image or video) and returns its bytes. Done in Rust
/// rather than the webview so the request isn't subject to the webview's CORS
/// policy, which the media CDN does not satisfy.
#[tauri::command]
pub async fn download_media(url: String) -> Result<DownloadedMedia, AppError> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Http(format!("Failed to fetch media: {e}")))?;

    if !response.status().is_success() {
        return Err(AppError::Http(format!(
            "Failed to fetch media: HTTP {}",
            response.status()
        )));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Http(format!("Failed to read media body: {e}")))?;

    Ok(DownloadedMedia {
        content_type,
        data: STANDARD.encode(&bytes),
    })
}
