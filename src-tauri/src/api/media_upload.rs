use base64::{engine::general_purpose::STANDARD, Engine as _};
use grindr::GrindrClient;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::photo::{self, Photo};
use crate::state::AppState;

const MAX_AUDIO_BYTES: usize = 32 * 1024 * 1024;

/// What the API accepts for one chat video. Refused here rather than after the
/// bytes have been pushed over a phone connection.
const MAX_VIDEO_BYTES: usize = 12 * 1024 * 1024;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaUploadResponse {
	pub media_id: i64,
	pub url: String,
	pub media_hash: String,
}

async fn upload_signed_v6(
	client: &GrindrClient,
	photo: Photo,
) -> Result<MediaUploadResponse, AppError> {
	let response = client
		.upload_chat_media(photo.bytes, &photo.content_type, None, None, true)
		.await
		.map_err(|e| AppError::from_client_error(e, client))?;

	Ok(MediaUploadResponse {
		media_id: response.media_id,
		url: response.url,
		media_hash: response.media_hash,
	})
}

async fn upload_unsigned_v5(
	client: &GrindrClient,
	photo: Photo,
) -> Result<MediaUploadResponse, AppError> {
	let response = client
		.upload_chat_media_unsigned(photo.bytes, &photo.content_type)
		.await
		.map_err(|e| AppError::from_client_error(e, client))?;

	Ok(MediaUploadResponse {
		media_id: response.media_id,
		url: response.url,
		media_hash: response.media_hash,
	})
}

/// Signing marks media as taken on Grindr regardless of the query parameter,
/// so only in-app captures may take the signed endpoint.
#[tauri::command]
pub async fn upload_chat_media(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	content_type: String,
	taken_on_grindr: bool,
	// Base64, because raw byte arrays over the Tauri IPC are unreliable.
	// https://github.com/tauri-apps/tauri/issues/10573
	data: String,
) -> Result<MediaUploadResponse, AppError> {
	let bytes = STANDARD.decode(&data).map_err(|e| {
		AppError::Http(format!("Failed to decode base64 media: {e}"))
	})?;
	let photo = photo::normalize(&app, bytes, content_type).await?;

	let client = state.client()?;
	if taken_on_grindr {
		upload_signed_v6(&client, photo).await
	} else {
		upload_unsigned_v5(&client, photo).await
	}
}

/// The webview records voice notes itself, so the bytes arrive already
/// containerised (AAC in MP4 on iOS, Opus in WebM elsewhere) and must reach the
/// API untouched — `photo::normalize` would only mangle them. Recorded in the
/// app is a first-party capture, so this takes the signed endpoint, which is
/// also the only one that carries the clip's length.
#[tauri::command]
pub async fn upload_chat_audio(
	state: tauri::State<'_, AppState>,
	content_type: String,
	// Milliseconds, as the API reports an `"Audio"` message's own `length`.
	length_ms: Option<i64>,
	// Base64, for the same reason as `upload_chat_media` above.
	data: String,
) -> Result<MediaUploadResponse, AppError> {
	if !content_type.starts_with("audio/") {
		return Err(AppError::Http(format!(
			"Refusing to upload {content_type} as audio"
		)));
	}
	let bytes = STANDARD.decode(&data).map_err(|e| {
		AppError::Http(format!("Failed to decode base64 audio: {e}"))
	})?;
	if bytes.is_empty() {
		return Err(AppError::Http("Refusing to upload empty audio".into()));
	}
	// The recorder caps a take at five minutes, which is a couple of megabytes
	// of AAC. Anything approaching this is a bug on our side, and better refused
	// here than pushed at the API.
	if bytes.len() > MAX_AUDIO_BYTES {
		return Err(AppError::Http(format!(
			"Refusing to upload {} bytes of audio",
			bytes.len()
		)));
	}

	let client = state.client()?;
	let response = client
		.upload_chat_media(bytes, &content_type, length_ms, None, true)
		.await
		.map_err(|e| AppError::from_client_error(e, &client))?;

	Ok(MediaUploadResponse {
		media_id: response.media_id,
		url: response.url,
		media_hash: response.media_hash,
	})
}

/// A video picked from the gallery. Unlike a photo the bytes go up untouched —
/// `photo::normalize` would only mangle a container — and unlike a voice note
/// this takes the *unsigned* endpoint: signing marks media as taken on Grindr,
/// and a file off the camera roll was not.
///
/// `length` is seconds here, not the milliseconds an `"Audio"` message carries;
/// it is the unit a `"Video"` message reports its own length in.
#[tauri::command]
pub async fn upload_chat_video(
	state: tauri::State<'_, AppState>,
	content_type: String,
	length_seconds: Option<i64>,
	looping: bool,
	// Base64, for the same reason as `upload_chat_media` above.
	data: String,
) -> Result<MediaUploadResponse, AppError> {
	if !content_type.starts_with("video/") {
		return Err(AppError::Http(format!(
			"Refusing to upload {content_type} as video"
		)));
	}
	let bytes = STANDARD.decode(&data).map_err(|e| {
		AppError::Http(format!("Failed to decode base64 video: {e}"))
	})?;
	if bytes.is_empty() {
		return Err(AppError::Http("Refusing to upload empty video".into()));
	}
	if bytes.len() > MAX_VIDEO_BYTES {
		return Err(AppError::Media("That video is too large to send".into()));
	}

	let mut path =
		format!("/v5/chat/media/upload?takenOnGrindr=false&looping={looping}");
	if let Some(length) = length_seconds {
		path.push_str(&format!("&length={length}"));
	}

	let client = state.client()?;
	let response = client
		.request_authenticated_bytes(
			grindr::Method::POST,
			&path,
			&content_type,
			bytes,
		)
		.await
		.map_err(|e| AppError::from_client_error(e, &client))?;

	if !(200..300).contains(&response.status) {
		return Err(AppError::from_client_error(
			grindr::GrindrError::from_response(response.status, &response.body),
			&client,
		));
	}

	serde_json::from_slice(&response.body).map_err(|e| {
		AppError::Http(format!("Failed to parse video upload response: {e}"))
	})
}

/// The album endpoint takes `multipart/form-data`, the only upload in the API
/// that does, so the body is assembled here rather than by the transport.
fn multipart_body(
	boundary: &str,
	field: &str,
	filename: &str,
	content_type: &str,
	bytes: &[u8],
) -> Vec<u8> {
	let mut body = Vec::with_capacity(bytes.len() + 256);
	body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
	body.extend_from_slice(
		format!(
			"Content-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
		)
		.as_bytes(),
	);
	body.extend_from_slice(
		format!("Content-Type: {content_type}\r\n\r\n").as_bytes(),
	);
	body.extend_from_slice(bytes);
	body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
	body
}

fn new_boundary() -> String {
	let mut bytes = [0u8; 16];
	getrandom::fill(&mut bytes).expect("system randomness unavailable");
	let mut boundary = String::from("----open-grind");
	for byte in bytes {
		boundary.push_str(&format!("{byte:02x}"));
	}
	boundary
}

/// The filename is echoed nowhere the app can see, but the API rejects a part
/// without one, and an extension that matches the bytes keeps it honest.
fn filename_for(content_type: &str) -> &'static str {
	match content_type {
		"image/png" => "content.png",
		"image/webp" => "content.webp",
		"video/mp4" => "content.mp4",
		"video/webm" => "content.webm",
		_ => "content.jpg",
	}
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumContentUploadResponse {
	pub content_id: i64,
	pub content_url: Option<String>,
}

/// Adds one photo or clip to an album. Stills go through the same
/// normalization as chat media — the API takes what it is given, so an
/// untouched 12-megapixel HEIC would be uploaded as-is.
#[tauri::command]
pub async fn upload_album_content(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	album_id: i64,
	content_type: String,
	// Base64, for the same reason as `upload_chat_media` above.
	data: String,
) -> Result<AlbumContentUploadResponse, AppError> {
	let bytes = STANDARD.decode(&data).map_err(|e| {
		AppError::Http(format!("Failed to decode base64 media: {e}"))
	})?;
	if bytes.is_empty() {
		return Err(AppError::Http("Refusing to upload empty media".into()));
	}
	let photo = photo::normalize(&app, bytes, content_type).await?;

	let boundary = new_boundary();
	let body = multipart_body(
		&boundary,
		"content",
		filename_for(&photo.content_type),
		&photo.content_type,
		&photo.bytes,
	);

	let client = state.client()?;
	let response = client
		.request_authenticated_bytes(
			grindr::Method::POST,
			&format!("/v1/albums/{album_id}/content"),
			&format!("multipart/form-data; boundary={boundary}"),
			body,
		)
		.await
		.map_err(|e| AppError::from_client_error(e, &client))?;

	if !(200..300).contains(&response.status) {
		return Err(AppError::from_client_error(
			grindr::GrindrError::from_response(response.status, &response.body),
			&client,
		));
	}

	serde_json::from_slice(&response.body).map_err(|e| {
		AppError::Http(format!("Failed to parse album upload response: {e}"))
	})
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImageUploadResponse {
	pub media_hash: String,
}

#[derive(Deserialize)]
struct LegacyMediaUploadResponse {
	hash: String,
}

/// The square thumbnail the API insists on: the largest centred square the
/// photo holds. A non-square crop uploads without complaint and is then
/// silently dropped by `PUT /v3/me/profile/images`, so it is not optional.
///
/// Stringified as `y2,x1,x2,y1` — the order the API reads a `RectF` in, not
/// the order anyone would guess.
fn centre_square_thumb_coords(width: u32, height: u32) -> String {
	let side = width.min(height);
	let x1 = (width - side) / 2;
	let y1 = (height - side) / 2;
	format!("{},{},{},{}", y1 + side, x1, x1 + side, y1)
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RightNowMediaUploadResponse {
	pub media_id: i64,
	pub url: String,
	pub thumbnail_url: String,
}

/// The largest centred square the photo holds, as `(top, left, right, bottom)`.
/// The Right Now upload names those four edges separately rather than taking the
/// packed `thumbCoords` string the profile endpoint does.
fn centre_square(width: u32, height: u32) -> (u32, u32, u32, u32) {
	let side = width.min(height);
	let left = (width - side) / 2;
	let top = (height - side) / 2;
	(top, left, left + side, top + side)
}

/// Uploads the photo attached to a Right Now post. A different endpoint from
/// both chat media and profile photos, and the only one that answers with the
/// thumbnail URL the feed renders.
///
/// Unsigned, for the same reason as the others: the photo came out of the
/// gallery, and signing would claim it was taken in the app.
#[tauri::command]
pub async fn upload_right_now_media(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	content_type: String,
	// Base64, for the same reason as `upload_chat_media` above.
	data: String,
) -> Result<RightNowMediaUploadResponse, AppError> {
	let bytes = STANDARD.decode(&data).map_err(|e| {
		AppError::Http(format!("Failed to decode base64 media: {e}"))
	})?;
	let photo = photo::normalize(&app, bytes, content_type).await?;
	if photo.content_type != "image/jpeg" {
		return Err(AppError::Media(
			"A Right Now photo has to be a still image".to_owned(),
		));
	}
	let (width, height) = photo::dimensions(&photo.bytes).ok_or_else(|| {
		AppError::Media("Unreadable or damaged photo".to_owned())
	})?;
	let (top, left, right, bottom) = centre_square(width, height);

	let client = state.client()?;
	let response = client
		.request_authenticated_bytes(
			grindr::Method::POST,
			&format!(
				"/v1/media/upload?img_1_top={top}&img_1_left={left}&img_1_right={right}&img_1_bottom={bottom}"
			),
			&photo.content_type,
			photo.bytes,
		)
		.await
		.map_err(|e| AppError::from_client_error(e, &client))?;

	if !(200..300).contains(&response.status) {
		return Err(AppError::from_client_error(
			grindr::GrindrError::from_response(response.status, &response.body),
			&client,
		));
	}

	serde_json::from_slice(&response.body).map_err(|e| {
		AppError::Http(format!(
			"Failed to parse Right Now upload response: {e}"
		))
	})
}

/// Uploads a profile photo and returns its media hash, which is what
/// `PUT /v3/me/profile/images` takes. Nothing about the profile changes until
/// that call — an upload on its own only parks the file on the CDN.
///
/// Takes the unsigned legacy endpoint for the same reason chat media does:
/// signing marks the media as taken on Grindr, and a photo out of the gallery
/// was not.
#[tauri::command]
pub async fn upload_profile_image(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	content_type: String,
	// Base64, for the same reason as `upload_chat_media` above.
	data: String,
) -> Result<ProfileImageUploadResponse, AppError> {
	let bytes = STANDARD.decode(&data).map_err(|e| {
		AppError::Http(format!("Failed to decode base64 media: {e}"))
	})?;
	let photo = photo::normalize(&app, bytes, content_type).await?;
	if photo.content_type != "image/jpeg" {
		return Err(AppError::Media(
			"A profile photo has to be a still image".to_owned(),
		));
	}
	let (width, height) = photo::dimensions(&photo.bytes).ok_or_else(|| {
		AppError::Media("Unreadable or damaged photo".to_owned())
	})?;

	let client = state.client()?;
	let response = client
		.request_authenticated_bytes(
			grindr::Method::POST,
			&format!(
				"/v4/media/upload?thumbCoords={}&takenOnGrindr=false",
				centre_square_thumb_coords(width, height)
			),
			&photo.content_type,
			photo.bytes,
		)
		.await
		.map_err(|e| AppError::from_client_error(e, &client))?;

	if !(200..300).contains(&response.status) {
		return Err(AppError::from_client_error(
			grindr::GrindrError::from_response(response.status, &response.body),
			&client,
		));
	}

	let parsed: LegacyMediaUploadResponse =
		serde_json::from_slice(&response.body).map_err(|e| {
			AppError::Http(format!(
				"Failed to parse photo upload response: {e}"
			))
		})?;

	Ok(ProfileImageUploadResponse {
		media_hash: parsed.hash,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_centre_square_of_a_landscape_photo_is_its_middle() {
		assert_eq!(centre_square(1024, 512), (0, 256, 768, 512));
	}

	#[test]
	fn the_centre_square_of_a_square_photo_is_the_whole_photo() {
		assert_eq!(centre_square(600, 600), (0, 0, 600, 600));
	}

	#[test]
	fn a_landscape_photo_is_cropped_to_the_middle_square() {
		assert_eq!(centre_square_thumb_coords(1024, 512), "512,256,768,0");
	}

	#[test]
	fn a_portrait_photo_is_cropped_to_the_middle_square() {
		assert_eq!(centre_square_thumb_coords(512, 1024), "768,0,512,256");
	}

	#[test]
	fn a_square_photo_is_left_whole() {
		assert_eq!(centre_square_thumb_coords(600, 600), "600,0,600,0");
	}

	#[test]
	fn the_multipart_body_wraps_the_bytes_in_one_part() {
		let body = multipart_body(
			"BOUND",
			"content",
			"content.jpg",
			"image/jpeg",
			&[1, 2, 3],
		);
		let text = String::from_utf8_lossy(&body);

		assert!(text.starts_with("--BOUND\r\nContent-Disposition: form-data; name=\"content\"; filename=\"content.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"));
		assert!(text.ends_with("\r\n--BOUND--\r\n"));
		assert!(text.contains("\r\n\u{1}\u{2}\u{3}\r\n"));
	}
}
