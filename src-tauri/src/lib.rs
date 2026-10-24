pub mod api;
mod app_icon;
mod app_origin;
mod app_settings;
mod appearance;
mod appimage;
mod capabilities;
mod context_menu;
mod desktop_entry;
mod error;
mod haptics;
mod hex;
mod keep_screen_on;
#[cfg(target_os = "android")]
mod keyboard_media;
pub mod media;
#[cfg(target_os = "android")]
mod media_drag;
mod media_picker;
mod photo;
#[cfg(test)]
mod pin_support;
mod plugin_rejection;
mod scroll_phase;
mod state;
mod storage;
mod upload;
mod video;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod webview_recovery;

// Belt and braces for the deadlock described against the `devtools` feature in
// Cargo.toml: nothing catches it at runtime, and it only bites on device, so
// refuse to produce a release binary that carries it.
#[cfg(all(not(debug_assertions), feature = "devtools"))]
compile_error!(
	"the `devtools` feature pulls in tauri/tracing, which makes Webview::eval \
	 block on the main thread and deadlocks the app on foreground. It is for \
	 `tauri dev` only — drop it from release builds."
);

use tauri::Manager;

use crate::state::AppState;

#[cfg(target_os = "windows")]
const MIN_CHROMIUM_MAJOR: u32 = 111;
#[cfg(target_os = "linux")]
const MIN_WEBKITGTK: (u32, u32) = (2, 42);

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";

const OPEN_GRIND_PLATFORM: &str = if cfg!(target_os = "android") {
	"android"
} else if cfg!(target_os = "ios") {
	"ios"
} else if cfg!(target_os = "windows") {
	"windows"
} else if cfg!(target_os = "macos") {
	"macos"
} else if cfg!(target_os = "linux") {
	"linux"
} else {
	"unknown"
};

fn regrind_platform_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R>
{
	tauri::plugin::Builder::<R, ()>::new("regrind-platform")
		.js_init_script(format!(
			r#"window.__OPEN_GRIND_PLATFORM = "{OPEN_GRIND_PLATFORM}";"#
		))
		.build()
}

// macOS reports a WebKit build number that doesn't track Safari versions
#[cfg(desktop)]
fn outdated_webview_notice() -> Option<String> {
	#[cfg(target_os = "windows")]
	{
		let version = tauri::webview_version().ok()?;
		if version.split('.').next()?.parse::<u32>().ok()? < MIN_CHROMIUM_MAJOR
		{
			return Some(format!(
                "ReGrind needs Microsoft Edge WebView2 {MIN_CHROMIUM_MAJOR} or newer to \
                 display correctly (found {version}).\n\nUpdate the WebView2 Runtime, then \
                 restart the app."
            ));
		}
	}

	#[cfg(target_os = "linux")]
	{
		let version = tauri::webview_version().ok()?;
		let mut parts = version.split('.');
		let major = parts.next()?.parse::<u32>().ok()?;
		let minor = parts
			.next()
			.and_then(|p| p.parse::<u32>().ok())
			.unwrap_or(0);
		if (major, minor) < MIN_WEBKITGTK {
			let (min_major, min_minor) = MIN_WEBKITGTK;
			return Some(format!(
                "ReGrind needs WebKitGTK {min_major}.{min_minor} or newer to display \
                 correctly (found {version}).\n\nUpdate webkit2gtk / your distribution, \
                 then restart the app."
            ));
		}
	}

	None
}

#[cfg(desktop)]
pub(crate) fn focus_main_window(app: &tauri::AppHandle) {
	if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
		let _ = window.unminimize();
		let _ = window.show();
		let _ = window.set_focus();
	}
}

// Tauri exits only once every window is gone, and sign-in opens a second one.
#[cfg(desktop)]
fn quit_when_closed(window: &tauri::WebviewWindow) {
	if window.label() != MAIN_WINDOW_LABEL {
		return;
	}
	let app = window.app_handle().clone();
	window.on_window_event(move |event| {
		if matches!(event, tauri::WindowEvent::Destroyed) {
			app.exit(0);
		}
	});
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	#[cfg(target_os = "linux")]
	appearance::apply_environment_defaults();

	api::update::enforce_home();

	#[cfg(feature = "devtools")]
	let devtools = tauri_plugin_devtools::init();

	let mut context = tauri::generate_context!();
	context.config_mut().app.android_hostname = app_origin::android_hostname();

	let builder = tauri::Builder::default();

	// Plugins run in registration order and this one must be first:
	// https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/single-instance
	#[cfg(desktop)]
	let builder = builder.plugin(tauri_plugin_single_instance::init(
		|app, _args, _cwd| focus_main_window(app),
	));

	// Gated on the feature rather than debug_assertions: see the note in
	// Cargo.toml on why tauri-plugin-devtools has to stay opt-in.
	#[cfg(feature = "devtools")]
	let builder = builder.plugin(devtools);

	#[cfg(target_os = "android")]
	let builder = builder
		.plugin(tauri_plugin_android_fs::init())
		.plugin(photo::plugin())
		.plugin(keyboard_media::plugin())
		.plugin(media_drag::plugin())
		.plugin(api::recaptcha::plugin())
		.plugin(app_origin::android::plugin());

	#[cfg(mobile)]
	let builder = builder.plugin(tauri_plugin_haptics::init());

	// Recover a WKWebView whose web content process iOS jettisoned while we were
	// backgrounded. Reloading here (we're still in the background) can't bring
	// the process back, so both hooks only record state — `webview_recovery`
	// reloads on the way back to the foreground. See that module for why.
	#[cfg(any(target_os = "ios", target_os = "macos"))]
	let builder = builder
		.on_web_content_process_terminate(
			webview_recovery::on_content_process_terminated,
		)
		.on_page_load(|_webview, _payload| webview_recovery::on_page_load());

	builder
        .plugin(regrind_platform_plugin())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_geolocation::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(api::google_oauth::plugin())
        .plugin(api::facebook_oauth::plugin())
        .plugin(api::update::plugin())
        .plugin(app_settings::plugin())
        .plugin(app_icon::plugin())
        .plugin(video::transcode::plugin())
        .plugin(media_picker::plugin())
        .manage(AppState::default())
        .manage(upload::UploadLock::default())
        .manage(media::MediaProxy::default())
        .manage(api::session_recovery::SessionRecovery::default())
        .register_asynchronous_uri_scheme_protocol(media::SCHEME, media::handle)
        .invoke_handler(tauri::generate_handler![
            api::auth::sign_in_with_email,
            api::auth::sign_in_with_google,
            api::auth::sign_in_with_google_token,
            api::auth::backend_ready,
            api::auth::google_handoff_pending,
            api::auth::sign_in_with_google_handoff,
            api::auth::discard_google_handoff,
            api::auth::sign_in_with_facebook,
            api::auth::refresh_session,
            api::auth::sign_out,
            api::auth::account_restriction,
            api::auth::session_feature_flags,
            api::auth::recaptcha_first_party_enabled,
            api::accounts::accounts_list,
            api::accounts::account_switch,
            api::accounts::account_add_begin,
            api::accounts::account_add_cancel,
            api::accounts::account_add_in_progress,
            api::accounts::account_remove,
            api::accounts::account_set_profile,
            api::recaptcha::mint_recaptcha_token,
            storage::storage_backend,
            api::rest::request,
            api::rest::fetch_external,
            media::media_failure,
            upload::bytes::upload_media,
            upload::bytes::upload_chat_audio,
            upload::bytes::upload_chat_video,
            upload::bytes::upload_chat_video_file,
            upload::bytes::video_transcoding_supported,
            upload::bytes::upload_right_now_media,
            upload::bytes::upload_album_content,
            upload::bytes::upload_profile_image,
            upload::inspect::inspect_media_file,
            upload::preview::preview_media,
            upload::file::upload_media_file,
            api::media_download::download_media,
            upload::staged::stage_media,
            upload::staged::append_staged_media,
            upload::staged::discard_staged_media,
            upload::linked::stage_linked_media,
            api::ws::ws_connect,
            api::ws::ws_send,
            api::client::rotate_api_params,
            api::session_recovery::set_app_active,
            api::session_recovery::current_session,
            haptics::play_haptic,
            keep_screen_on::set_keep_screen_on,
            scroll_phase::set_scroll_gesture_capture,
            desktop_entry::desktop_entry_state,
            desktop_entry::desktop_entry_install,
            desktop_entry::desktop_entry_remove,
            api::update::commands::updater_capability,
            api::update::commands::updater_settings,
            api::update::commands::updater_set_auto_check,
            api::update::commands::updater_check,
            api::update::commands::updater_download,
            api::update::commands::updater_cancel_download,
            api::update::commands::updater_progress,
            api::update::commands::updater_readiness,
            api::update::commands::updater_install,
            api::update::commands::updater_install_pending,
            api::update::commands::updater_installed_version,
            api::update::commands::updater_take_install_outcome,
            api::update::commands::updater_open_install_permission_settings,
            api::update::commands::updater_discard,
            app_settings::open_app_settings,
            app_icon::get_app_icon,
            app_icon::set_app_icon,
            media_picker::pick_android_media,
            appearance::backdrop_filter_renders,
            appearance::webview_engine,
        ])
        .setup(|app| {
            scroll_phase::install_scroll_gesture_bridge(app.handle());
            #[cfg(target_os = "android")]
            app_origin::android::prepare_served_origin(app.handle());
            upload::staged::discard_all(app.handle());
            let user_agent = format!(
                "open-grind/{} (+https://opengrind.org/; contact: admin@opengrind.org)",
                app.package_info().version
            );
            let deferred: Vec<_> = app
                .config()
                .app
                .windows
                .iter()
                .filter(|window| !window.create)
                .cloned()
                .collect();
            for window in deferred {
                let builder =
                    tauri::WebviewWindowBuilder::from_config(app.handle(), &window)?
                        .user_agent(&user_agent)
                        .on_navigation(|url| {
                            app_origin::is_app_url(url, app_origin::SERVED_HOSTNAME)
                        });
                #[cfg(any(target_os = "macos", target_os = "windows"))]
                let builder = builder.disable_drag_drop_handler();
                #[cfg(target_os = "linux")]
                let builder = builder.extensions_path(
                    app.path().resource_dir()?.join(media::WEBKIT_EXTENSIONS),
                );
                let window = builder.build()?;
                #[cfg(target_os = "linux")]
                media::serve_element_opens(&window);
                #[cfg(target_os = "linux")]
                scroll_phase::follow_touchpad(&window);
                appearance::unlock_visual_effects(&window);
                context_menu::trim_native_menu(&window);
                #[cfg(desktop)]
                quit_when_closed(&window);
            }

            #[cfg(desktop)]
            if let Some(message) = outdated_webview_notice() {
                use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                app.dialog()
                    .message(message)
                    .title("WebView may be too old")
                    .kind(MessageDialogKind::Warning)
                    .show(|_| {});
            }

            #[cfg(any(
                target_os = "linux",
                all(target_os = "macos", not(feature = "keychain"))
            ))]
            storage::init_file_store(app.path().app_local_data_dir()?);

            app.manage(storage::init_keyring());

            // Brings up a client per signed-in account, points the app at one,
            // and starts the tasks that persist each account's secrets and carry
            // the active one's events to the frontend.
            api::accounts::restore_on_launch(app.handle());

            Ok(())
        })
        .build(context)
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // `applicationWillEnterForeground`, which Tauri reports per-window
            // rather than as the top-level `RunEvent::Resumed`. This is the
            // point where a webview that lost its content process while we were
            // away can actually be brought back.
            #[cfg(target_os = "ios")]
            if matches!(
                _event,
                tauri::RunEvent::WindowEvent {
                    event: tauri::WindowEvent::Resumed,
                    ..
                }
            ) {
                webview_recovery::on_resumed(_app);
            }
        });
}

#[cfg(test)]
mod tests {
	#[test]
	fn release_builds_discard_every_tracing_event() {
		let expected = if cfg!(debug_assertions) {
			tracing::level_filters::LevelFilter::TRACE
		} else {
			tracing::level_filters::LevelFilter::OFF
		};
		assert_eq!(tracing::level_filters::STATIC_MAX_LEVEL, expected);
	}
}

#[cfg(test)]
mod webview_floor_pins {
	const THIS: &str = include_str!("lib.rs");
	const TAURI_CONF: &str = include_str!("../tauri.conf.json");
	const GRADLE: &str = include_str!("../gen/android/app/build.gradle.kts");
	const APP_HTML: &str = include_str!("../../src/app.html");

	fn numbers_after<'a>(
		haystack: &'a str,
		marker: &str,
	) -> impl Iterator<Item = u32> + 'a {
		let at = haystack.find(marker).expect(marker) + marker.len();
		haystack[at..]
			.split(|c: char| !c.is_ascii_digit())
			.filter(|run| !run.is_empty())
			.map(|run| run.parse().unwrap())
	}

	#[test]
	fn every_webview_floor_names_the_same_chromium_major() {
		let rust =
			numbers_after(THIS, "const MIN_CHROMIUM_MAJOR: u32 =").next();
		assert_eq!(
			rust,
			numbers_after(TAURI_CONF, "\"minimumWebview2Version\":").next()
		);
		assert_eq!(
			rust,
			numbers_after(GRADLE, "MIN_SUPPORTED_WEBVIEW_MAJOR\",").next()
		);
	}

	#[test]
	fn the_unsupported_page_names_the_webkitgtk_floor() {
		let rust: Vec<u32> =
			numbers_after(THIS, "const MIN_WEBKITGTK: (u32, u32) =")
				.take(2)
				.collect();
		let page: Vec<u32> =
			numbers_after(APP_HTML, "<code>webkit2gtk</code> (")
				.take(2)
				.collect();
		assert_eq!(rust, page);
	}
}

#[cfg(test)]
mod frontend_method_pins {
	const THIS: &str = include_str!("lib.rs");
	const METHODS: &str = include_str!("../../src/lib/api/methods.ts");
	const TRANSPORT: &str = include_str!("../../src/lib/api/transport.ts");

	fn between<'a>(haystack: &'a str, open: &str, close: &str) -> &'a str {
		let start = haystack.find(open).expect(open) + open.len();
		let len = haystack[start..].find(close).expect(close);
		&haystack[start..start + len]
	}

	fn registered_commands() -> Vec<&'static str> {
		between(THIS, "tauri::generate_handler![", "])")
			.split(',')
			.filter_map(|entry| entry.trim().rsplit("::").next())
			.collect()
	}

	#[test]
	fn every_command_the_transport_invokes_is_registered() {
		let registered = registered_commands();
		let invoked: Vec<&str> = ["invoke(\"", "invokeRest(\""]
			.into_iter()
			.flat_map(|opener| TRANSPORT.split(opener).skip(1))
			.filter_map(|rest| rest.split_once('"'))
			.map(|(command, _)| command)
			.collect();
		assert!(invoked.contains(&"fetch_external"), "{invoked:?}");
		for command in invoked {
			assert!(
				registered.contains(&command),
				"{command} is invoked by transport.ts but not registered"
			);
		}
	}

	#[test]
	fn every_frontend_method_is_a_registered_command() {
		let registered = registered_commands();
		let methods: Vec<&str> =
			between(METHODS, "export const methods = {", "\n}")
				.lines()
				.filter_map(|line| line.strip_prefix('\t'))
				.filter(|line| !line.starts_with(['\t', '}']))
				.filter(|line| !line.starts_with("//"))
				.map(|line| line.split_once(':').expect(line).0)
				.collect();
		assert!(!methods.is_empty());
		for method in methods {
			assert!(
				registered.contains(&method),
				"{method} is called by the frontend but not registered"
			);
		}
	}
}

#[cfg(test)]
mod opener_scope_pins {
	const CAPABILITY: &str = include_str!("../capabilities/default.json");

	#[test]
	fn the_system_browser_is_never_handed_an_app_origin() {
		let capability: serde_json::Value =
			serde_json::from_str(CAPABILITY).unwrap();
		let denied: Vec<&str> = capability["permissions"]
			.as_array()
			.unwrap()
			.iter()
			.filter(|permission| {
				permission["identifier"] == "opener:allow-open-url"
			})
			.flat_map(|permission| permission["deny"].as_array().unwrap())
			.map(|scope| scope["url"].as_str().unwrap())
			.collect();
		let android_origin =
			format!("https://{}", crate::app_origin::ANDROID_HOSTNAME);
		for origin in [
			"http://tauri.localhost",
			"https://tauri.localhost",
			&android_origin,
			"http://ogmedia.localhost",
			"https://ogmedia.localhost",
			"http://localhost",
			"http://127.0.0.1",
		] {
			assert!(
				denied.contains(&format!("{origin}*").as_str()),
				"{origin} can still be opened in the system browser"
			);
		}
	}
}
