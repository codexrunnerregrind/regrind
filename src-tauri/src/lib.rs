pub mod api;
mod app_icon;
mod app_language;
mod app_origin;
#[cfg(mobile)]
mod app_settings;
mod appearance;
#[cfg(target_os = "linux")]
mod appimage;
#[cfg(any(target_os = "ios", test))]
mod background_task;
#[cfg(any(target_os = "ios", test))]
mod backup_exclusion;
mod capabilities;
#[cfg(target_os = "ios")]
mod child_scroller;
#[cfg(target_os = "windows")]
mod context_menu;
#[cfg(target_os = "linux")]
mod desktop_entry;
mod error;
mod flip_privacy;
mod haptics;
mod hex;
mod keep_screen_on;
#[cfg(target_os = "android")]
mod keyboard_media;
pub mod media;
#[cfg(target_os = "android")]
mod media_drag;
#[cfg(mobile)]
mod media_picker;
#[cfg(any(desktop, target_os = "ios"))]
mod native_strings;
#[cfg(any(target_os = "ios", test))]
mod page_point;
mod photo;
#[cfg(test)]
mod pin_support;
mod plugin_rejection;
#[cfg(target_os = "ios")]
mod presenting;
mod regional;
#[cfg(test)]
mod scratch_dir;
mod scroll_phase;
#[cfg(any(target_os = "ios", test))]
mod soft_keyboard;
mod state;
mod storage;
#[cfg(any(target_os = "ios", test))]
mod system_gestures;
mod transfer;
#[cfg(target_os = "ios")]
mod uikit;
mod upload;
mod video;
#[cfg(any(target_os = "ios", test))]
mod voice_over;
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

#[cfg(any(target_os = "windows", target_os = "linux"))]
use crate::native_strings::NativeText;
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
#[cfg(any(target_os = "windows", target_os = "linux"))]
struct OutdatedWebView {
	description: NativeText,
	update: NativeText,
	minimum: String,
	found: String,
}

#[cfg(target_os = "windows")]
fn outdated_webview() -> Option<OutdatedWebView> {
	let version = tauri::webview_version().ok()?;
	let major = version.split('.').next()?.parse::<u32>().ok()?;
	(major < MIN_CHROMIUM_MAJOR).then(|| OutdatedWebView {
		description: NativeText::WebView2Description,
		update: NativeText::WebView2Update,
		minimum: MIN_CHROMIUM_MAJOR.to_string(),
		found: version,
	})
}

#[cfg(target_os = "linux")]
fn outdated_webview() -> Option<OutdatedWebView> {
	let version = tauri::webview_version().ok()?;
	let mut parts = version.split('.');
	let major = parts.next()?.parse::<u32>().ok()?;
	let minor = parts
		.next()
		.and_then(|p| p.parse::<u32>().ok())
		.unwrap_or(0);
	let (min_major, min_minor) = MIN_WEBKITGTK;
	((major, minor) < MIN_WEBKITGTK).then(|| OutdatedWebView {
		description: NativeText::WebKitGtkDescription,
		update: NativeText::WebKitGtkUpdate,
		minimum: format!("{min_major}.{min_minor}"),
		found: version,
	})
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn warn_about_outdated_webview(app: &tauri::AppHandle) {
	use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

	let Some(outdated) = outdated_webview() else {
		return;
	};
	let strings = app_language::native_strings(app);
	let description = strings.fill(
		outdated.description,
		&[
			("minimumVersion", &outdated.minimum),
			("version", &outdated.found),
		],
	);
	app.dialog()
		.message(format!(
			"{description}\n\n{}",
			strings.text(outdated.update)
		))
		.title(strings.text(NativeText::WebViewWarningTitle))
		.kind(MessageDialogKind::Warning)
		.show(|_| {});
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

#[cfg(target_os = "ios")]
fn reseed_ios_page(
	window: tauri::WebviewWindow,
	payload: tauri::webview::PageLoadPayload<'_>,
) {
	match payload.event() {
		tauri::webview::PageLoadEvent::Started => {
			system_gestures::back_swipe::disarm(&window);
			soft_keyboard::ios::forget_page(&window);
		}
		tauri::webview::PageLoadEvent::Finished => {
			soft_keyboard::ios::resend_insets(&window);
		}
	}
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	#[cfg(target_os = "linux")]
	appearance::apply_environment_defaults();

	#[cfg(target_os = "macos")]
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
		.plugin(app_origin::android::plugin())
		.plugin(app_settings::android::plugin())
		.plugin(media_picker::android::plugin());

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

	let builder = builder
		.plugin(regrind_platform_plugin())
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_clipboard_manager::init())
		.plugin(tauri_plugin_os::init())
		.plugin(tauri_plugin_geolocation::init())
		.plugin(tauri_plugin_fs::init())
		.plugin(tauri_plugin_opener::init())
		.plugin(tauri_plugin_notification::init())
		.plugin(api::google_oauth::plugin())
		.plugin(api::facebook_oauth::plugin());

	#[cfg(any(target_os = "android", desktop))]
	let builder = builder.plugin(api::update::plugin());

	builder
        .plugin(app_icon::plugin())
        .plugin(video::transcode::plugin())
        .plugin(regional::plugin())
        .plugin(app_language::plugin())
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
            upload::staged::read_staged_media,
            upload::staged::stage_proxied_photo,
            upload::linked::stage_linked_media,
            api::ws::ws_connect,
            api::ws::ws_send,
            api::client::rotate_api_params,
            api::session_recovery::set_app_active,
            api::session_recovery::current_session,
            #[cfg(target_os = "ios")]
            api::session_recovery::allow_suspension,
            haptics::play_haptic,
            keep_screen_on::set_keep_screen_on,
            flip_privacy::set_flip_privacy,
            scroll_phase::set_scroll_gesture_capture,
            #[cfg(target_os = "linux")]
            desktop_entry::desktop_entry_state,
            #[cfg(target_os = "linux")]
            desktop_entry::desktop_entry_install,
            #[cfg(target_os = "linux")]
            desktop_entry::desktop_entry_remove,
            api::grindr_version::refresh_grindr_version,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_capability,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_settings,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_set_auto_check,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_check,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_download,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_cancel_download,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_progress,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_readiness,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_install,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_install_pending,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_installed_version,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_take_install_outcome,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_open_install_permission_settings,
            #[cfg(any(target_os = "android", desktop))]
            api::update::commands::updater_discard,
            #[cfg(target_os = "android")]
            app_settings::android::open_app_settings,
            #[cfg(target_os = "ios")]
            app_settings::ios::open_app_settings,
            app_icon::get_app_icon,
            app_icon::set_app_icon,
            #[cfg(target_os = "android")]
            media_picker::android::pick_android_media,
            #[cfg(target_os = "ios")]
            media_picker::ios::pick_ios_media,
            #[cfg(target_os = "ios")]
            soft_keyboard::ios::set_keyboard_follow,
            #[cfg(target_os = "ios")]
            soft_keyboard::ios::set_keyboard_drag_dismiss,
            #[cfg(target_os = "ios")]
            system_gestures::back_swipe::set_back_swipe_armed,
            #[cfg(target_os = "ios")]
            system_gestures::scroll_to_top::stop_scroll_momentum,
            #[cfg(target_os = "ios")]
            voice_over::ios::voice_over_running,
            appearance::backdrop_filter_renders,
            appearance::webview_engine,
            regional::regional_settings,
            app_language::app_languages,
            app_language::set_app_language,
            app_language::set_native_language,
        ])
        .setup(|app| {
            #[cfg(target_os = "ios")]
            backup_exclusion::exclude_from_backups(app.handle());
            #[cfg(target_os = "ios")]
            background_task::install(app.handle());
            #[cfg(target_os = "macos")]
            scroll_phase::macos::install(app.handle().clone());
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
                #[cfg(target_os = "ios")]
                let window = tauri::utils::config::WindowConfig {
                    allow_link_preview: false,
                    disable_input_accessory_view: true,
                    ..window
                };
                let builder =
                    tauri::WebviewWindowBuilder::from_config(app.handle(), &window)?
                        .user_agent(&user_agent)
                        .on_navigation(|url| {
                            app_origin::is_app_url(url, app_origin::SERVED_HOSTNAME)
                        });
                #[cfg(any(target_os = "macos", target_os = "windows"))]
                let builder = builder.disable_drag_drop_handler();
                #[cfg(target_os = "ios")]
                let builder = builder.on_page_load(reseed_ios_page);
                #[cfg(target_os = "linux")]
                let builder = builder.extensions_path(
                    app.path().resource_dir()?.join(media::WEBKIT_EXTENSIONS),
                );
                #[cfg_attr(target_os = "android", allow(unused_variables))]
                let window = builder.build()?;
                #[cfg(target_os = "ios")]
                soft_keyboard::ios::install(&window);
                #[cfg(target_os = "ios")]
                system_gestures::back_swipe::install(&window);
                #[cfg(target_os = "ios")]
                system_gestures::scroll_to_top::install(&window);
                #[cfg(target_os = "ios")]
                voice_over::ios::install(&window);
                #[cfg(target_os = "linux")]
                media::serve_element_opens(&window);
                #[cfg(target_os = "linux")]
                scroll_phase::follow_touchpad(&window);
                #[cfg(all(target_os = "macos", feature = "private-api"))]
                appearance::unlock_visual_effects(&window);
                #[cfg(target_os = "windows")]
                context_menu::trim_native_menu(&window);
                #[cfg(desktop)]
                quit_when_closed(&window);
                #[cfg(desktop)]
                regional::refresh_on_focus(&window);
                #[cfg(desktop)]
                app_language::refresh_on_focus(&window);
            }

            #[cfg(any(target_os = "windows", target_os = "linux"))]
            warn_about_outdated_webview(app.handle());

            #[cfg(any(
                target_os = "linux",
                all(target_os = "macos", not(feature = "keychain"))
            ))]
            storage::init_file_store(app.path().app_local_data_dir()?);

            app.manage(storage::init_keyring());

            api::grindr_version::init(app.handle());

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
	const KEYBOARD_FOLLOW: &str =
		include_str!("../../src/lib/platform/keyboard-follow.ts");
	const KEYBOARD_DRAG_DISMISS: &str =
		include_str!("../../src/lib/platform/keyboard-drag-dismiss.ts");
	const IOS_SYSTEM_BACK: &str =
		include_str!("../../src/lib/platform/ios-system-back.ts");
	const SCROLL_MOMENTUM: &str =
		include_str!("../../src/lib/platform/scroll-momentum.ts");
	const VOICE_OVER: &str =
		include_str!("../../src/lib/platform/voice-over.svelte.ts");
	const APP_LIFECYCLE: &str =
		include_str!("../../src/lib/api/app-lifecycle.svelte.ts");
	const APP_SETTINGS: &str =
		include_str!("../../src/lib/platform/app-settings.ts");
	const MEDIA_PICKER: &str =
		include_str!("../../src/lib/platform/media-picker.ts");

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

	fn invoked_commands(source: &str) -> Vec<&str> {
		source
			.split("invoke")
			.skip(1)
			.filter_map(|rest| {
				let arguments = match rest.strip_prefix('<') {
					Some(generic) => generic.split_once(">(")?.1,
					None => rest.strip_prefix('(')?,
				};
				Some(arguments.strip_prefix('"')?.split_once('"')?.0)
			})
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
	fn every_command_the_native_bridges_invoke_is_registered() {
		let registered = registered_commands();
		let bridges: &[(&str, &[&str])] = &[
			(KEYBOARD_FOLLOW, &["set_keyboard_follow"]),
			(KEYBOARD_DRAG_DISMISS, &["set_keyboard_drag_dismiss"]),
			(IOS_SYSTEM_BACK, &["set_back_swipe_armed"]),
			(VOICE_OVER, &["voice_over_running"]),
			(SCROLL_MOMENTUM, &["stop_scroll_momentum"]),
			(APP_LIFECYCLE, &["allow_suspension"]),
			(APP_SETTINGS, &["open_app_settings"]),
			(MEDIA_PICKER, &["pick_ios_media", "pick_android_media"]),
		];
		for (source, expected) in bridges {
			assert_eq!(&invoked_commands(source), expected);
			for command in *expected {
				assert!(
					registered.contains(command),
					"{command} is invoked by a native bridge but not registered"
				);
			}
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
	fn geo_urls_can_be_opened_from_the_main_window() {
		let capability: serde_json::Value =
			serde_json::from_str(CAPABILITY).unwrap();
		assert!(capability["windows"]
			.as_array()
			.unwrap()
			.iter()
			.any(|window| window == "main"));
		assert!(capability["permissions"].as_array().unwrap().iter().any(
			|permission| {
				permission["identifier"] == "opener:allow-open-url"
					&& permission["allow"]
						.as_array()
						.unwrap()
						.iter()
						.any(|scope| scope["url"] == "geo:*")
			}
		));
	}

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
