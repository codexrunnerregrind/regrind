#[tauri::command]
pub fn set_keep_screen_on(window: tauri::WebviewWindow, enabled: bool) {
	#[cfg(target_os = "android")]
	android::apply(&window, enabled);

	#[cfg(target_os = "ios")]
	ios::apply(&window, enabled);

	#[cfg(not(any(target_os = "android", target_os = "ios")))]
	let _ = (window, enabled);
}

#[cfg(target_os = "android")]
mod android {
	use jni::objects::{JObject, JValue};
	use jni::JNIEnv;

	// WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
	const FLAG_KEEP_SCREEN_ON: i32 = 0x80;

	fn set_flag(
		env: &mut JNIEnv<'_>,
		activity: &JObject<'_>,
		enabled: bool,
	) -> jni::errors::Result<()> {
		let window = env
			.call_method(activity, "getWindow", "()Landroid/view/Window;", &[])?
			.l()?;
		let method = if enabled { "addFlags" } else { "clearFlags" };
		env.call_method(
			&window,
			method,
			"(I)V",
			&[JValue::Int(FLAG_KEEP_SCREEN_ON)],
		)?;
		Ok(())
	}

	pub fn apply<R: tauri::Runtime>(
		window: &tauri::WebviewWindow<R>,
		enabled: bool,
	) {
		let dispatched = window.with_webview(move |webview| {
			webview.jni_handle().exec(move |env, activity, _view| {
				if set_flag(env, activity, enabled).is_err() {
					env.exception_clear().ok();
				}
			});
		});
		if let Err(e) = dispatched {
			tracing::warn!("[keep-screen-on] could not reach the webview: {e}");
		}
	}
}

#[cfg(target_os = "ios")]
mod ios {
	use objc2::msg_send;
	use objc2::runtime::{AnyClass, AnyObject};

	pub fn apply<R: tauri::Runtime>(
		window: &tauri::WebviewWindow<R>,
		enabled: bool,
	) {
		// UIKit is main-thread only.
		let dispatched = window.run_on_main_thread(move || {
			let Some(class) = AnyClass::get(c"UIApplication") else {
				return;
			};
			unsafe {
				let app: *mut AnyObject = msg_send![class, sharedApplication];
				if let Some(app) = app.as_ref() {
					let _: () = msg_send![app, setIdleTimerDisabled: enabled];
				}
			}
		});
		if let Err(e) = dispatched {
			tracing::warn!(
				"[keep-screen-on] could not reach the main thread: {e}"
			);
		}
	}
}
