//! Re-encodes a picked clip before it is uploaded.
//!
//! The chat API refuses an oversized clip with a bare 413 — 15 MB has been
//! refused and the real limit is unpublished — while a few seconds off a phone
//! camera is several times that at 4K, so a clip has to come down before it
//! goes up. Both platforms aim at what the official client sends, 720p H.264 in
//! MP4, through their own encoder: `AVAssetExportSession` on iOS
//! (`native/VideoTranscode.m`, reached over FFI) and Media3 `Transformer` on
//! Android (`VideoPlugin.kt`, reached through the usual Tauri plugin handle).
//!
//! Desktop has neither, and no camera to produce an oversized clip either, so
//! there the file is read as it is.

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;
use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::{AppHandle, Wry};

use crate::error::AppError;

#[cfg(target_os = "android")]
struct AndroidVideo {
	handle: PluginHandle<Wry>,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("regrind-video")
		.setup(|_app, _api| {
			#[cfg(target_os = "android")]
			{
				let handle = _api.register_android_plugin(
					"org.regrind.video",
					"VideoPlugin",
				)?;
				_app.manage(AndroidVideo { handle });
			}
			Ok(())
		})
		.build()
}

/// Whether this build can shrink a clip at all. The frontend asks before it
/// offers to send one, so a platform without an encoder says so up front rather
/// than after a doomed upload.
pub fn supported() -> bool {
	cfg!(any(target_os = "ios", target_os = "android"))
}

/// What the re-encode aims to come in under. The API publishes no limit; 15 MB
/// and 16 MB have both been refused, so this sits below the smallest refusal
/// seen with room to spare. It is a target, not a guarantee — a long enough
/// clip misses it even at the lowest quality on offer. Android's Transformer
/// has no equivalent size target, so there the 720p pass is the only one.
#[cfg(target_os = "ios")]
const TARGET_BYTES: usize = 10 * 1024 * 1024;

#[cfg(target_os = "ios")]
extern "C" {
	/// 0 on success; see `RegrindTranscodeStatus` in `VideoTranscode.m`. On
	/// failure `error` is filled with a sentence describing what went wrong.
	fn regrind_transcode_video(
		input: *const std::ffi::c_char,
		output: *const std::ffi::c_char,
		target_bytes: i64,
		error: *mut std::ffi::c_char,
		error_capacity: usize,
	) -> i32;
}

/// A path for the re-encoded copy, in the system temp dir and unique per call
/// so two adds in flight cannot land on each other.
fn output_path() -> std::path::PathBuf {
	let mut bytes = [0u8; 8];
	getrandom::fill(&mut bytes).expect("system randomness unavailable");
	let mut name = String::from("regrind-clip-");
	for byte in bytes {
		name.push_str(&format!("{byte:02x}"));
	}
	name.push_str(".mp4");
	std::env::temp_dir().join(name)
}

#[cfg(target_os = "ios")]
async fn transcode(
	_app: &AppHandle,
	input: &str,
	output: &std::path::Path,
) -> Result<(), AppError> {
	use std::ffi::CString;

	let input = CString::new(input).map_err(|_| {
		AppError::Media("That video's location is not readable".into())
	})?;
	let target =
		CString::new(output.to_string_lossy().as_ref()).map_err(|_| {
			AppError::Media("Could not make room for the converted clip".into())
		})?;

	// Blocking: the export runs to completion behind a semaphore.
	let (status, reason) = tauri::async_runtime::spawn_blocking(move || {
		let mut buffer = [0 as std::ffi::c_char; 256];
		let status = unsafe {
			regrind_transcode_video(
				input.as_ptr(),
				target.as_ptr(),
				TARGET_BYTES as i64,
				buffer.as_mut_ptr(),
				buffer.len(),
			)
		};
		let reason = unsafe { std::ffi::CStr::from_ptr(buffer.as_ptr()) }
			.to_string_lossy()
			.into_owned();
		(status, reason)
	})
	.await
	.map_err(|e| {
		AppError::Media(format!("Video conversion did not run: {e}"))
	})?;

	if status != 0 {
		return Err(AppError::Media(format!(
			"Could not convert that video: {reason} (code {status})"
		)));
	}
	Ok(())
}

#[cfg(target_os = "android")]
async fn transcode(
	app: &AppHandle,
	input: &str,
	output: &std::path::Path,
) -> Result<(), AppError> {
	#[derive(serde::Serialize)]
	#[serde(rename_all = "camelCase")]
	struct Args {
		input: String,
		output: String,
	}

	let handle = app.state::<AndroidVideo>().handle.clone();
	handle
		.run_mobile_plugin_async::<serde_json::Value>(
			"transcode",
			Args {
				input: input.to_owned(),
				output: output.to_string_lossy().into_owned(),
			},
		)
		.await
		.map_err(|error| {
			AppError::Media(format!(
				"That video could not be converted for sending: {error}"
			))
		})?;
	Ok(())
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
async fn transcode(
	_app: &AppHandle,
	_input: &str,
	_output: &std::path::Path,
) -> Result<(), AppError> {
	Err(AppError::Media(
		"This build cannot convert video for sending".into(),
	))
}

/// The clip at `input`, re-encoded small enough to send.
///
/// `input` is whatever the picker handed the frontend — a filesystem path on
/// iOS, a `content://` URI on Android — and is passed to the platform encoder
/// untouched rather than being read here: the point of this path is that the
/// original's bytes never cross the IPC.
pub async fn shrink(app: &AppHandle, input: &str) -> Result<Vec<u8>, AppError> {
	let output = output_path();
	let result = transcode(app, input, &output).await;
	// The temp copy goes either way; on the error path there is nothing in it
	// worth keeping, and on the happy path the bytes are already in hand.
	let bytes = match result {
		Ok(()) => std::fs::read(&output).map_err(|e| {
			AppError::Media(format!("Could not read the converted clip: {e}"))
		}),
		Err(error) => Err(error),
	};
	let _ = std::fs::remove_file(&output);
	bytes
}
