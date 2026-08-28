//! The filenames the frontend uses have to be inside the fs scope granted in
//! `capabilities/default.json`, and nothing at build time checks that. The
//! per-account preference file was added without widening the scope, and the
//! result was a `forbidden path` at runtime — on device, where the plugin is
//! the only thing that reads it, and only for the account whose id was in the
//! name. These tests pin the two together.

#[cfg(test)]
mod tests {
	use glob::{MatchOptions, Pattern};

	const CAPABILITY: &str = include_str!("../capabilities/default.json");

	/// What `tauri::scope::fs` uses. `require_literal_separator` keeps `*` from
	/// crossing a `/`, which is why a pattern has to match the filename itself
	/// rather than leaning on a directory wildcard.
	fn match_options() -> MatchOptions {
		MatchOptions {
			require_literal_separator: true,
			..Default::default()
		}
	}

	fn allowed_paths(permission: &str) -> Vec<String> {
		let capability: serde_json::Value =
			serde_json::from_str(CAPABILITY).expect("capability is valid json");
		capability["permissions"]
			.as_array()
			.expect("permissions is an array")
			.iter()
			.filter(|entry| entry["identifier"] == permission)
			.flat_map(|entry| {
				entry["allow"]
					.as_array()
					.expect("allow is an array")
					.iter()
					.map(|allowed| {
						allowed["path"]
							.as_str()
							.expect("path is a string")
							.to_owned()
					})
					.collect::<Vec<_>>()
			})
			.collect()
	}

	fn is_allowed(permission: &str, path: &str) -> bool {
		allowed_paths(permission).iter().any(|allowed| {
			Pattern::new(allowed)
				.expect("allowed path is a valid glob")
				.matches_with(path, match_options())
		})
	}

	/// `preferences.{profileId}.data`, as written by `$lib/app-data`.
	fn account_file(profile_id: u64) -> String {
		format!("$APPLOCALDATA/preferences.{profile_id}.data")
	}

	#[test]
	fn an_accounts_own_preferences_are_inside_the_scope() {
		// The id that was refused in the wild, and a short one, since the
		// pattern must not depend on how many digits it has.
		for profile_id in [162_863_583, 42] {
			let path = account_file(profile_id);
			for permission in [
				"fs:allow-exists",
				"fs:allow-read-file",
				"fs:allow-write-file",
				"fs:allow-remove",
				"fs:allow-rename",
			] {
				assert!(
					is_allowed(permission, &path),
					"{permission} does not allow {path}"
				);
			}
		}
	}

	#[test]
	fn the_file_written_before_the_atomic_rename_is_inside_the_scope() {
		let temp = format!("{}.tmp", account_file(162_863_583));

		for permission in ["fs:allow-write-file", "fs:allow-rename"] {
			assert!(
				is_allowed(permission, &temp),
				"{permission} does not allow {temp}"
			);
		}
	}

	#[test]
	fn the_shared_preferences_file_is_still_inside_the_scope() {
		for permission in [
			"fs:allow-exists",
			"fs:allow-read-file",
			"fs:allow-write-file",
			"fs:allow-remove",
		] {
			assert!(
				is_allowed(permission, "$APPLOCALDATA/preferences.data"),
				"{permission} no longer allows the shared file"
			);
		}
	}

	#[test]
	fn the_credential_store_is_not_dragged_in_by_the_wildcard() {
		for path in [
			"$APPLOCALDATA/credentials/session_42",
			"$APPLOCALDATA/credentials/device-signing-key_42",
		] {
			assert!(
				!is_allowed("fs:allow-read-file", path),
				"{path} must stay unreadable from the frontend"
			);
		}
	}
}
