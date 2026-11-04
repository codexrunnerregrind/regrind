/// Starts/stops UIKit orientation delivery; never asks the webview for motion
/// permission and keeps the gesture working when interface rotation is locked.
#[tauri::command]
pub fn set_flip_privacy(
	window: tauri::WebviewWindow,
	enabled: bool,
) -> Result<(), String> {
	#[cfg(target_os = "ios")]
	{
		unsafe extern "C" {
			fn regrind_set_flip_privacy(
				view: *mut std::ffi::c_void,
				enabled: bool,
			);
		}
		window
			.with_webview(move |webview| unsafe {
				regrind_set_flip_privacy(webview.inner().cast(), enabled);
			})
			.map_err(|error| error.to_string())?;
	}
	#[cfg(not(target_os = "ios"))]
	let _ = (window, enabled);
	Ok(())
}
