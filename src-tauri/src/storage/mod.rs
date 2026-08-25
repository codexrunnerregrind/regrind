mod entries;
#[cfg(any(
	target_os = "linux",
	all(target_os = "macos", not(feature = "keychain"))
))]
mod file_store;

pub use entries::{
	adopt_legacy_account, forget_account, now_unix, AccountIndex,
	AccountRecord, AccountsStorage, AuthStorage, DeviceStorage, ProfileId,
	SigningKeyStorage,
};

#[cfg(any(
	target_os = "linux",
	all(target_os = "macos", not(feature = "keychain"))
))]
pub fn init_file_store(base: std::path::PathBuf) {
	file_store::init(base);
}

pub fn init_keyring() {
	#[cfg(target_os = "ios")]
	match apple_native_keyring_store::protected::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => tracing::error!("[storage] could not init iOS keyring: {e}"),
	}

	#[cfg(target_os = "android")]
	match android_native_keyring_store::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => {
			tracing::error!("[storage] could not init Android keyring: {e}")
		}
	}

	#[cfg(all(target_os = "macos", feature = "keychain"))]
	match apple_native_keyring_store::keychain::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => {
			tracing::error!("[storage] could not init macOS keyring: {e}")
		}
	}

	#[cfg(target_os = "windows")]
	match windows_native_keyring_store::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => {
			tracing::error!("[storage] could not init Windows keyring: {e}")
		}
	}

	#[cfg(target_os = "linux")]
	match dbus_secret_service_keyring_store::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => tracing::warn!(
			"[storage] no secret service, keeping file store: {e}"
		),
	}
}

#[cfg(all(
	test,
	any(
		target_os = "linux",
		all(target_os = "macos", not(feature = "keychain"))
	)
))]
mod tests {
	use std::path::Path;
	use std::sync::Mutex;

	use super::*;

	static DEFAULT_STORE: Mutex<()> = Mutex::new(());

	const ME: ProfileId = 42;
	const THEM: ProfileId = 77;

	fn lock() -> std::sync::MutexGuard<'static, ()> {
		DEFAULT_STORE.lock().unwrap_or_else(|e| e.into_inner())
	}

	fn with_file_store(test: impl FnOnce(&Path)) {
		let _guard = lock();
		let base = file_store::scratch_dir();
		init_file_store(base.clone());
		test(&base);
		std::fs::remove_dir_all(&base).ok();
	}

	fn entry(user: &str) -> keyring_core::Entry {
		keyring_core::Entry::new("open-grind", user).unwrap()
	}

	fn credentials_for(
		profile_id: ProfileId,
		auth_token: &str,
	) -> grindr::Credentials {
		serde_json::from_value(serde_json::json!({
			"email": "user@example.com",
			"profile_id": profile_id.to_string(),
			"auth_token": auth_token,
		}))
		.unwrap()
	}

	fn credentials(auth_token: &str) -> grindr::Credentials {
		credentials_for(ME, auth_token)
	}

	/// A session as an older build wrote it: the durable fields with the
	/// short-lived ones alongside, all in one flat map.
	fn legacy_session_blob(profile_id: ProfileId, session_id: &str) -> Vec<u8> {
		rmp_serde::encode::to_vec_named(&serde_json::json!({
			"email": "user@example.com",
			"expires_at": 9_999_999_999u64,
			"profile_id": profile_id.to_string(),
			"session_id": session_id,
			"auth_token": "auth-token",
		}))
		.unwrap()
	}

	fn session(auth_token: &str) -> grindr::Session {
		grindr::Session {
			credentials: credentials(auth_token),
			token: None,
		}
	}

	fn signing_key() -> grindr::DeviceSigningKey {
		serde_json::from_value(serde_json::json!({
			"key": "-----BEGIN PRIVATE KEY-----",
			"user_id": "42",
		}))
		.unwrap()
	}

	fn stored_names(base: &Path) -> Vec<String> {
		let mut names: Vec<_> = std::fs::read_dir(base.join("credentials"))
			.unwrap()
			.map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
			.collect();
		names.sort();
		names
	}

	#[test]
	fn every_secret_is_stored_under_the_account_that_owns_it() {
		with_file_store(|base| {
			DeviceStorage::save(ME, &grindr::DeviceInfo::generate()).unwrap();
			AuthStorage::set_credentials(ME, &credentials("auth-token"))
				.unwrap();
			SigningKeyStorage::save(ME, &signing_key()).unwrap();

			// The file store replaces `:` in a key, so the on-disk names carry
			// the profile after an underscore rather than a colon.
			assert_eq!(
				stored_names(base),
				["device-info_42", "device-signing-key_42", "session_42"]
			);
		});
	}

	#[test]
	fn two_accounts_keep_separate_secrets() {
		with_file_store(|_| {
			AuthStorage::set_credentials(ME, &credentials_for(ME, "mine"))
				.unwrap();
			AuthStorage::set_credentials(
				THEM,
				&credentials_for(THEM, "theirs"),
			)
			.unwrap();

			assert_eq!(
				AuthStorage::get_credentials(ME)
					.unwrap()
					.unwrap()
					.auth_token,
				"mine"
			);
			assert_eq!(
				AuthStorage::get_credentials(THEM)
					.unwrap()
					.unwrap()
					.auth_token,
				"theirs"
			);
		});
	}

	#[test]
	fn each_account_gets_its_own_device_identity() {
		with_file_store(|_| {
			let mine = DeviceStorage::load_or_create(ME);
			let theirs = DeviceStorage::load_or_create(THEM);

			assert_ne!(
				mine.device_id, theirs.device_id,
				"a shared fingerprint would tie the two accounts together"
			);
			assert_eq!(
				DeviceStorage::load_or_create(ME).device_id,
				mine.device_id,
				"an account's device has to be stable across launches"
			);
		});
	}

	#[test]
	fn forgetting_one_account_leaves_the_other_untouched() {
		with_file_store(|_| {
			for id in [ME, THEM] {
				AuthStorage::set_credentials(id, &credentials_for(id, "s"))
					.unwrap();
				DeviceStorage::save(id, &grindr::DeviceInfo::generate())
					.unwrap();
				SigningKeyStorage::save(id, &signing_key()).unwrap();
			}

			forget_account(ME);

			assert!(AuthStorage::get_session(ME).unwrap().is_none());
			assert!(DeviceStorage::load(ME).unwrap().is_none());
			assert!(SigningKeyStorage::load(ME).unwrap().is_none());
			assert!(AuthStorage::get_session(THEM).unwrap().is_some());
			assert!(DeviceStorage::load(THEM).unwrap().is_some());
			assert!(SigningKeyStorage::load(THEM).unwrap().is_some());
		});
	}

	#[test]
	fn init_keyring_leaves_a_usable_store_behind() {
		with_file_store(|_| {
			init_keyring();

			assert!(keyring_core::get_default_store().is_some());
			assert!(keyring_core::Entry::new("open-grind", "session:1").is_ok());
		});
	}

	#[test]
	fn nothing_is_stored_before_anything_is_saved() {
		with_file_store(|_| {
			assert!(DeviceStorage::load(ME).unwrap().is_none());
			assert!(AuthStorage::get_session(ME).unwrap().is_none());
			assert!(SigningKeyStorage::load(ME).unwrap().is_none());
			assert_eq!(
				AccountsStorage::load().unwrap(),
				AccountIndex::default()
			);
		});
	}

	#[test]
	fn a_device_survives_a_save_and_load() {
		with_file_store(|_| {
			let device = grindr::DeviceInfo::generate();

			DeviceStorage::save(ME, &device).unwrap();

			let loaded = DeviceStorage::load(ME).unwrap().unwrap();
			assert_eq!(format!("{loaded:?}"), format!("{device:?}"));
		});
	}

	#[test]
	fn a_device_stored_before_build_id_existed_still_loads() {
		#[derive(serde::Serialize)]
		struct DeviceBeforeBuildId {
			device_type: u8,
			device_id: &'static str,
			os: &'static str,
			screen_resolution: &'static str,
			total_ram: &'static str,
			advertising_id: &'static str,
			device_model: &'static str,
			manufacturer: &'static str,
			timezone: &'static str,
			locale: &'static str,
			accept_language: &'static str,
		}

		with_file_store(|_| {
			let stored = rmp_serde::encode::to_vec(&DeviceBeforeBuildId {
				device_type: 2,
				device_id: "0123456789abcdef",
				os: "Android 14",
				screen_resolution: "2400x1080",
				total_ram: "8026152960",
				advertising_id: "ad-id",
				device_model: "Pixel 8",
				manufacturer: "Google",
				timezone: "Europe/Madrid",
				locale: "en_US",
				accept_language: "en-US",
			})
			.unwrap();
			entry("device-info:42").set_secret(&stored).unwrap();

			let loaded = DeviceStorage::load(ME).unwrap().unwrap();

			assert_eq!(loaded.device_id, "0123456789abcdef");
			assert_eq!(loaded.device_model, "Pixel 8");
			assert!(loaded.build_id.is_empty());
		});
	}

	#[test]
	fn every_secret_is_stored_as_a_named_map_not_a_positional_array() {
		with_file_store(|_| {
			DeviceStorage::save(ME, &grindr::DeviceInfo::generate()).unwrap();
			AuthStorage::set_credentials(ME, &credentials("s1")).unwrap();
			SigningKeyStorage::save(ME, &signing_key()).unwrap();
			AccountsStorage::save(&AccountIndex::default()).unwrap();

			for name in [
				"device-info:42",
				"session:42",
				"device-signing-key:42",
				"accounts",
			] {
				let stored = entry(name).get_secret().unwrap();
				let decoded: serde_json::Value =
					rmp_serde::from_slice(&stored).unwrap();

				assert!(
					decoded.is_object(),
					"{name} is a positional array, not a named map"
				);
			}
		});
	}

	#[test]
	fn a_device_that_cannot_be_decoded_is_reported_as_an_error() {
		with_file_store(|_| {
			entry("device-info:42").set_secret(b"not msgpack").unwrap();

			assert!(DeviceStorage::load(ME).is_err());
		});
	}

	#[test]
	fn a_created_device_is_persisted_for_the_next_launch() {
		with_file_store(|_| {
			let created = DeviceStorage::load_or_create(ME);

			assert_eq!(
				format!("{:?}", DeviceStorage::load_or_create(ME)),
				format!("{created:?}")
			);
		});
	}

	#[test]
	fn a_device_that_cannot_be_decoded_is_replaced_rather_than_regenerated_forever(
	) {
		with_file_store(|_| {
			entry("device-info:42").set_secret(b"not msgpack").unwrap();

			let replacement = DeviceStorage::load_or_create(ME);

			assert_eq!(
				format!("{:?}", DeviceStorage::load(ME).unwrap().unwrap()),
				format!("{replacement:?}")
			);
		});
	}

	#[test]
	fn deleting_the_device_clears_it() {
		with_file_store(|_| {
			DeviceStorage::save(ME, &grindr::DeviceInfo::generate()).unwrap();

			DeviceStorage::delete(ME);

			assert!(DeviceStorage::load(ME).unwrap().is_none());
		});
	}

	#[test]
	fn credentials_survive_a_save_and_load() {
		with_file_store(|_| {
			let saved = credentials("auth-token");

			AuthStorage::set_credentials(ME, &saved).unwrap();

			let loaded = AuthStorage::get_credentials(ME).unwrap().unwrap();
			assert_eq!(loaded.auth_token, saved.auth_token);
			assert_eq!(loaded.email, saved.email);
			assert_eq!(loaded.profile_id, saved.profile_id);
		});
	}

	#[test]
	fn a_resumed_session_carries_no_token() {
		with_file_store(|_| {
			AuthStorage::set_credentials(ME, &credentials("auth-token"))
				.unwrap();

			let session = AuthStorage::get_session(ME).unwrap().unwrap();

			assert_eq!(session.credentials.auth_token, "auth-token");
			assert!(
				session.token.is_none(),
				"the minted session id dies within the hour and is never stored"
			);
		});
	}

	#[test]
	fn a_session_written_by_an_older_build_still_reads_back() {
		with_file_store(|_| {
			entry("session:42")
				.set_secret(&legacy_session_blob(ME, "old-session"))
				.unwrap();

			let loaded = AuthStorage::get_credentials(ME).unwrap().unwrap();

			assert_eq!(loaded.auth_token, "auth-token");
			assert_eq!(loaded.email, "user@example.com");
			assert_eq!(loaded.profile_id.as_deref(), Some("42"));
		});
	}

	#[test]
	fn a_session_that_cannot_be_decoded_is_discarded_rather_than_kept() {
		with_file_store(|_| {
			entry("session:42").set_secret(b"not msgpack").unwrap();

			assert!(AuthStorage::get_session(ME).unwrap().is_none());
			assert!(matches!(
				entry("session:42").get_secret(),
				Err(keyring_core::Error::NoEntry)
			));
		});
	}

	#[test]
	fn setting_a_session_replaces_the_previous_one() {
		with_file_store(|_| {
			AuthStorage::set_credentials(ME, &credentials("first")).unwrap();
			AuthStorage::set_credentials(ME, &credentials("second")).unwrap();

			assert_eq!(
				AuthStorage::get_credentials(ME)
					.unwrap()
					.unwrap()
					.auth_token,
				"second"
			);
		});
	}

	#[test]
	fn deleting_the_session_clears_it() {
		with_file_store(|_| {
			AuthStorage::set_credentials(ME, &credentials("auth-token"))
				.unwrap();

			AuthStorage::delete_session(ME);

			assert!(AuthStorage::get_session(ME).unwrap().is_none());
		});
	}

	#[test]
	fn a_signing_key_survives_a_save_and_load() {
		with_file_store(|_| {
			let key = signing_key();

			SigningKeyStorage::save(ME, &key).unwrap();

			let loaded = SigningKeyStorage::load(ME).unwrap().unwrap();
			assert_eq!(format!("{loaded:?}"), format!("{key:?}"));
		});
	}

	#[test]
	fn a_signing_key_that_cannot_be_decoded_reads_as_absent() {
		with_file_store(|_| {
			entry("device-signing-key:42")
				.set_secret(b"not msgpack")
				.unwrap();

			assert!(SigningKeyStorage::load(ME).unwrap().is_none());
		});
	}

	#[test]
	fn a_signing_key_the_client_refuses_is_dropped_from_storage() {
		with_file_store(|_| {
			SigningKeyStorage::save(ME, &signing_key()).unwrap();
			let client = grindr::GrindrClient::new(
				grindr::DeviceInfo::generate(),
				Some(session("session-token")),
			)
			.unwrap();

			tokio::runtime::Builder::new_current_thread()
				.build()
				.unwrap()
				.block_on(SigningKeyStorage::restore(ME, &client));

			assert!(SigningKeyStorage::load(ME).unwrap().is_none());
		});
	}

	#[test]
	fn deleting_the_signing_key_clears_it() {
		with_file_store(|_| {
			SigningKeyStorage::save(ME, &signing_key()).unwrap();

			SigningKeyStorage::delete(ME);

			assert!(SigningKeyStorage::load(ME).unwrap().is_none());
		});
	}

	fn record(profile_id: ProfileId, label: &str) -> AccountRecord {
		AccountRecord {
			profile_id,
			label: label.to_owned(),
			added_at: profile_id,
		}
	}

	#[test]
	fn an_added_account_becomes_the_active_one() {
		with_file_store(|_| {
			AccountsStorage::upsert(record(ME, "me@example.com")).unwrap();
			let index =
				AccountsStorage::upsert(record(THEM, "them@example.com"))
					.unwrap();

			assert_eq!(index.active, Some(THEM));
			assert_eq!(index.accounts.len(), 2);
		});
	}

	#[test]
	fn signing_into_the_same_account_twice_lists_it_once() {
		with_file_store(|_| {
			AccountsStorage::upsert(record(ME, "old@example.com")).unwrap();
			let index =
				AccountsStorage::upsert(record(ME, "new@example.com")).unwrap();

			assert_eq!(index.accounts.len(), 1);
			assert_eq!(index.accounts[0].label, "new@example.com");
		});
	}

	#[test]
	fn removing_the_active_account_hands_over_to_another() {
		with_file_store(|_| {
			AccountsStorage::upsert(record(ME, "me@example.com")).unwrap();
			AccountsStorage::upsert(record(THEM, "them@example.com")).unwrap();

			let index = AccountsStorage::remove(THEM).unwrap();

			assert_eq!(index.active, Some(ME));
			assert_eq!(index.resolved_active(), Some(ME));
		});
	}

	#[test]
	fn removing_the_last_account_leaves_nothing_active() {
		with_file_store(|_| {
			AccountsStorage::upsert(record(ME, "me@example.com")).unwrap();

			let index = AccountsStorage::remove(ME).unwrap();

			assert!(index.accounts.is_empty());
			assert_eq!(index.resolved_active(), None);
		});
	}

	#[test]
	fn an_active_pointer_at_an_account_that_is_gone_falls_back() {
		let index = AccountIndex {
			accounts: vec![record(ME, "me@example.com")],
			active: Some(THEM),
		};

		assert_eq!(index.resolved_active(), Some(ME));
	}

	#[test]
	fn an_unreadable_account_index_starts_over_rather_than_failing() {
		with_file_store(|_| {
			entry("accounts").set_secret(b"not msgpack").unwrap();

			assert_eq!(
				AccountsStorage::load().unwrap(),
				AccountIndex::default()
			);
			assert!(matches!(
				entry("accounts").get_secret(),
				Err(keyring_core::Error::NoEntry)
			));
		});
	}

	#[test]
	fn the_existing_single_account_install_is_adopted_under_its_profile() {
		with_file_store(|_| {
			let device = grindr::DeviceInfo::generate();
			entry("session")
				.set_secret(&legacy_session_blob(ME, "legacy-token"))
				.unwrap();
			entry("device-info")
				.set_secret(&rmp_serde::encode::to_vec_named(&device).unwrap())
				.unwrap();
			entry("device-signing-key")
				.set_secret(
					&rmp_serde::encode::to_vec_named(&signing_key()).unwrap(),
				)
				.unwrap();

			adopt_legacy_account().unwrap();

			let index = AccountsStorage::load().unwrap();
			assert_eq!(index.active, Some(ME));
			assert_eq!(index.accounts.len(), 1);
			assert_eq!(index.accounts[0].label, "user@example.com");
			assert_eq!(
				AuthStorage::get_credentials(ME)
					.unwrap()
					.unwrap()
					.auth_token,
				"auth-token"
			);
			assert_eq!(
				DeviceStorage::load(ME).unwrap().unwrap().device_id,
				device.device_id,
				"the account has to keep the device it was signed in with"
			);
			assert!(SigningKeyStorage::load(ME).unwrap().is_some());
			for name in ["session", "device-info", "device-signing-key"] {
				assert!(
					matches!(
						entry(name).get_secret(),
						Err(keyring_core::Error::NoEntry)
					),
					"{name} should have been moved, not copied"
				);
			}
		});
	}

	#[test]
	fn adopting_runs_once_and_leaves_a_populated_index_alone() {
		with_file_store(|_| {
			AccountsStorage::upsert(record(THEM, "them@example.com")).unwrap();
			entry("session")
				.set_secret(&legacy_session_blob(ME, "legacy"))
				.unwrap();

			adopt_legacy_account().unwrap();

			let index = AccountsStorage::load().unwrap();
			assert_eq!(index.accounts.len(), 1);
			assert_eq!(index.accounts[0].profile_id, THEM);
			assert!(AuthStorage::get_session(ME).unwrap().is_none());
		});
	}

	#[test]
	fn a_signed_out_install_has_nothing_to_adopt_and_keeps_no_leftovers() {
		with_file_store(|_| {
			entry("device-info")
				.set_secret(
					&rmp_serde::encode::to_vec_named(
						&grindr::DeviceInfo::generate(),
					)
					.unwrap(),
				)
				.unwrap();

			adopt_legacy_account().unwrap();

			assert!(AccountsStorage::load().unwrap().accounts.is_empty());
			assert!(matches!(
				entry("device-info").get_secret(),
				Err(keyring_core::Error::NoEntry)
			));
		});
	}

	#[test]
	fn with_no_store_at_all_the_storages_report_errors_instead_of_panicking() {
		let _guard = lock();
		keyring_core::unset_default_store();

		assert!(DeviceStorage::load(ME).is_err());
		assert!(AuthStorage::get_session(ME).unwrap().is_none());
		assert!(SigningKeyStorage::load(ME).unwrap().is_none());
		assert!(AuthStorage::set_credentials(ME, &credentials("auth-token"))
			.is_err());
		assert!(AccountsStorage::save(&AccountIndex::default()).is_err());
		DeviceStorage::delete(ME);
		AuthStorage::delete_session(ME);
		SigningKeyStorage::delete(ME);
	}
}
