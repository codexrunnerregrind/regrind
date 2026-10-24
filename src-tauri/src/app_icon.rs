//! Alternate ("discreet") launcher icons. iOS switches between the
//! `AppIcon-<Id>` sets; Android enables one `.AppIcon<Id>` activity alias.
//! The OS keeps the choice, so there is no preference to sync.

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;
use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::{AppHandle, Wry};

use crate::error::AppError;

#[cfg(target_os = "android")]
struct AndroidAppIcon {
	handle: PluginHandle<Wry>,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("app-icon")
		.setup(|_app, _api| {
			#[cfg(target_os = "android")]
			{
				let handle = _api.register_android_plugin(
					"org.regrind.appicon",
					"AppIconPlugin",
				)?;
				_app.manage(AndroidAppIcon { handle });
			}
			Ok(())
		})
		.build()
}

/// `None` is the regular ReGrind icon.
#[tauri::command]
pub async fn get_app_icon(app: AppHandle) -> Result<Option<String>, AppError> {
	#[cfg(target_os = "android")]
	{
		#[derive(serde::Deserialize)]
		struct Current {
			icon: Option<String>,
		}
		let handle = app.state::<AndroidAppIcon>().handle.clone();
		let current: Current = handle
			.run_mobile_plugin_async("getAppIcon", ())
			.await
			.map_err(|error| {
				AppError::Http(format!("Could not read the app icon: {error}"))
			})?;
		Ok(current.icon)
	}
	#[cfg(target_os = "ios")]
	return ios::get(&app).await;
	#[cfg(not(any(target_os = "android", target_os = "ios")))]
	{
		let _ = app;
		Ok(None)
	}
}

#[tauri::command]
pub async fn set_app_icon(
	app: AppHandle,
	icon: Option<String>,
) -> Result<(), AppError> {
	#[cfg(target_os = "android")]
	{
		let handle = app.state::<AndroidAppIcon>().handle.clone();
		handle
			.run_mobile_plugin_async::<serde_json::Value>(
				"setAppIcon",
				serde_json::json!({ "icon": icon }),
			)
			.await
			.map_err(|error| {
				AppError::Http(format!(
					"Could not change the app icon: {error}"
				))
			})?;
		Ok(())
	}
	#[cfg(target_os = "ios")]
	return ios::set(&app, icon).await;
	#[cfg(not(any(target_os = "android", target_os = "ios")))]
	{
		let _ = (app, icon);
		Err(AppError::Http("Only available on iOS and Android".into()))
	}
}

#[cfg(target_os = "ios")]
mod ios {
	use std::ffi::{c_char, CStr, CString};
	use std::sync::Mutex;

	use block2::RcBlock;
	use objc2::msg_send;
	use objc2::runtime::{AnyClass, AnyObject, Bool};
	use tauri::AppHandle;
	use tokio::sync::oneshot;

	use crate::error::AppError;

	const PREFIX: &str = "AppIcon-";

	unsafe fn shared_application() -> Option<&'static AnyObject> {
		let class = AnyClass::get(c"UIApplication")?;
		let app: *mut AnyObject = msg_send![class, sharedApplication];
		app.as_ref()
	}

	unsafe fn rust_string(string: *mut AnyObject) -> Option<String> {
		let string = string.as_ref()?;
		let utf8: *const c_char = msg_send![string, UTF8String];
		(!utf8.is_null())
			.then(|| CStr::from_ptr(utf8).to_string_lossy().into_owned())
	}

	fn unavailable() -> AppError {
		AppError::Http("This device can't change the app icon".into())
	}

	// UIKit is main-thread only, so each call hops there and reports back.
	async fn on_main<T: Send + 'static>(
		app: &AppHandle,
		run: impl FnOnce(oneshot::Sender<Result<T, AppError>>) + Send + 'static,
	) -> Result<T, AppError> {
		let (tx, rx) = oneshot::channel();
		app.run_on_main_thread(move || run(tx)).map_err(|error| {
			AppError::Http(format!("Could not reach the main thread: {error}"))
		})?;
		rx.await.map_err(|_| {
			AppError::Http("The app icon change was dropped".into())
		})?
	}

	pub async fn get(app: &AppHandle) -> Result<Option<String>, AppError> {
		on_main(app, |tx| {
			let name = unsafe {
				shared_application().map(|ui| {
					let name: *mut AnyObject = msg_send![ui, alternateIconName];
					rust_string(name)
				})
			};
			let result = name.ok_or_else(unavailable).map(|name| {
				name.and_then(|name| {
					name.strip_prefix(PREFIX).map(str::to_lowercase)
				})
			});
			let _ = tx.send(result);
		})
		.await
	}

	pub async fn set(
		app: &AppHandle,
		icon: Option<String>,
	) -> Result<(), AppError> {
		let name = icon
			// `weather-blue` is the `AppIcon-Weather-Blue` set.
			.map(|id| {
				let words: Vec<String> = id
					.split('-')
					.map(|word| {
						let mut chars = word.chars();
						chars
							.next()
							.map(|first| {
								first.to_uppercase().chain(chars).collect()
							})
							.unwrap_or_default()
					})
					.collect();
				CString::new(format!("{PREFIX}{}", words.join("-")))
			})
			.transpose()
			.map_err(|_| AppError::Http("Invalid app icon name".into()))?;

		on_main(app, move |tx| unsafe {
			let Some(ui) = shared_application() else {
				let _ = tx.send(Err(unavailable()));
				return;
			};
			let supported: Bool = msg_send![ui, supportsAlternateIcons];
			if !supported.as_bool() {
				let _ = tx.send(Err(unavailable()));
				return;
			}
			let ns_name: *mut AnyObject = match &name {
				Some(name) => {
					let class = AnyClass::get(c"NSString").expect("Foundation is loaded");
					msg_send![class, stringWithUTF8String: name.as_ptr()]
				}
				None => std::ptr::null_mut(),
			};
			// The block is Fn; the sender is used once.
			let tx = Mutex::new(Some(tx));
			let done = RcBlock::new(move |error: *mut AnyObject| {
				let result = match error.as_ref() {
					None => Ok(()),
					Some(error) => {
						let description: *mut AnyObject = msg_send![error, localizedDescription];
						Err(AppError::Http(
							rust_string(description)
								.unwrap_or_else(|| "Could not change the app icon".into()),
						))
					}
				};
				if let Some(tx) = tx.lock().ok().and_then(|mut tx| tx.take()) {
					let _ = tx.send(result);
				}
			});
			let _: () = msg_send![ui, setAlternateIconName: ns_name, completionHandler: &*done];
		})
		.await
	}
}
