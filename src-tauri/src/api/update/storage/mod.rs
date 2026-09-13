use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use semver::Version;

use super::baseline::Baseline;
use super::component::{self, Component};
use super::error::UpdateError;
use super::release::Candidate;

mod staged;
pub use staged::Staged;

pub(super) const SCHEMA: u32 = 2;
const STATE_FILE: &str = "state.json";
const PAYLOAD_FILE: &str = "payload";
const PART_FILE: &str = "payload.part";

#[derive(Debug, Clone)]
pub struct Stage {
	dir: PathBuf,
}

impl Stage {
	pub fn payload(&self) -> PathBuf {
		self.dir.join(PAYLOAD_FILE)
	}

	pub fn part(&self) -> PathBuf {
		self.dir.join(PART_FILE)
	}

	fn state(&self) -> PathBuf {
		self.dir.join(STATE_FILE)
	}

	pub fn create(&self) -> Result<(), UpdateError> {
		fs::create_dir_all(&self.dir)?;
		Ok(())
	}

	pub fn load(&self) -> Option<Staged> {
		let raw = fs::read(self.state()).ok()?;
		let staged: Staged = serde_json::from_slice(&raw).ok()?;
		(staged.schema == SCHEMA).then_some(staged)
	}

	pub fn save(&self, staged: &Staged) -> Result<(), UpdateError> {
		let encoded = serde_json::to_vec(staged)
			.map_err(|e| UpdateError::Storage(e.to_string()))?;
		write_durably(&self.state(), &encoded)
	}

	pub fn discard(&self) -> Result<(), UpdateError> {
		match fs::remove_dir_all(&self.dir) {
			Ok(()) => Ok(()),
			Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
			Err(e) => Err(e.into()),
		}
	}

	pub fn sweep_strays(&self) -> Result<(), UpdateError> {
		let known = [STATE_FILE, PAYLOAD_FILE, PART_FILE];
		for entry in read_dir(&self.dir) {
			let path = entry.path();
			let keep = path
				.file_name()
				.and_then(|name| name.to_str())
				.is_some_and(|name| known.contains(&name));
			if !keep {
				let _ = fs::remove_file(&path)
					.or_else(|_| fs::remove_dir_all(&path));
			}
		}
		Ok(())
	}
}

pub(super) fn write_durably(
	path: &Path,
	bytes: &[u8],
) -> Result<(), UpdateError> {
	let temp = path.with_extension("json.tmp");
	// FlushFileBuffers refuses read-only handles:
	// https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers
	let mut file = fs::File::create(&temp)?;
	file.write_all(bytes)?;
	file.sync_data()?;
	drop(file);
	fs::rename(&temp, path)?;
	Ok(())
}

pub fn root<R: tauri::Runtime>(
	app: &tauri::AppHandle<R>,
) -> Result<PathBuf, UpdateError> {
	use tauri::Manager;

	let cache = app
		.path()
		.app_cache_dir()
		.map_err(|e| UpdateError::Storage(e.to_string()))?;
	Ok(cache.join("updates"))
}

pub fn component_root<R: tauri::Runtime>(
	app: &tauri::AppHandle<R>,
	component: &Component,
) -> Result<PathBuf, UpdateError> {
	Ok(root(app)?.join(component.key))
}

pub fn sweep_foreign(root: &Path) {
	for entry in read_dir(root) {
		let path = entry.path();
		let known = path
			.file_name()
			.and_then(|name| name.to_str())
			.is_some_and(component::is_known_key);
		if !known {
			let _ = if path.is_dir() {
				fs::remove_dir_all(&path)
			} else {
				fs::remove_file(&path)
			};
		}
	}
}

pub fn stage(root: &Path, tag: &str) -> Result<Stage, UpdateError> {
	if !tag_is_safe(tag) {
		return Err(UpdateError::MalformedIndex(format!(
			"unusable release tag {tag}"
		)));
	}
	Ok(Stage {
		dir: root.join(tag),
	})
}

fn tag_is_safe(tag: &str) -> bool {
	!tag.is_empty()
		&& tag.len() <= 64
		&& tag.chars().all(|c| {
			c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '+' | '-')
		}) && !tag.starts_with('.')
}

pub fn purge(
	component: &Component,
	root: &Path,
	baseline: &Baseline,
	starting: Option<&Candidate>,
) {
	if matches!(baseline, Baseline::Unreadable { .. }) {
		return;
	}
	let kept = match starting {
		Some(candidate) => stage_describing(root, baseline, candidate),
		None => newest_eligible_stage(component, root, baseline),
	};

	for entry in read_dir(root) {
		let path = entry.path();
		if kept.as_ref() != Some(&path) {
			let _ =
				fs::remove_dir_all(&path).or_else(|_| fs::remove_file(&path));
		}
	}
}

fn stage_describing(
	root: &Path,
	baseline: &Baseline,
	candidate: &Candidate,
) -> Option<PathBuf> {
	if !candidate.fits(baseline) {
		return None;
	}
	let stage = stage(root, &candidate.tag).ok()?;
	stage
		.load()
		.is_some_and(|staged| staged.describes(candidate))
		.then_some(stage.dir)
}

fn newest_eligible_stage(
	component: &Component,
	root: &Path,
	baseline: &Baseline,
) -> Option<PathBuf> {
	eligible_stages(component, root, baseline)
		.filter(|(_, stage, _)| dir_name(&stage.dir).is_some_and(tag_is_safe))
		.max_by(|(left, ..), (right, ..)| left.cmp(right))
		.map(|(_, stage, _)| stage.dir)
}

pub fn resumable(
	component: &Component,
	root: &Path,
	baseline: &Baseline,
) -> Option<Candidate> {
	eligible_stages(component, root, baseline)
		.max_by(|(left, ..), (right, ..)| left.cmp(right))
		.and_then(|(_, _, staged)| staged.candidate())
}

pub fn verified(
	component: &Component,
	root: &Path,
	baseline: &Baseline,
) -> Option<(Stage, Staged)> {
	eligible_stages(component, root, baseline)
		.filter(|(_, stage, staged)| {
			staged.verified && staged.payload_on_disk(stage)
		})
		.max_by(|(left, ..), (right, ..)| left.cmp(right))
		.map(|(_, stage, staged)| (stage, staged))
}

fn eligible_stages<'a>(
	component: &'a Component,
	root: &Path,
	baseline: &'a Baseline,
) -> impl Iterator<Item = (Version, Stage, Staged)> + 'a {
	read_dir(root).filter_map(move |entry| {
		let stage = Stage { dir: entry.path() };
		let staged = stage.load()?;
		let version = staged.version()?;
		(staged.component == component.key
			&& baseline.accepts_stage(staged.kind, &version))
		.then_some((version, stage, staged))
	})
}

fn dir_name(path: &Path) -> Option<&str> {
	path.file_name()?.to_str()
}

fn read_dir(path: &Path) -> impl Iterator<Item = fs::DirEntry> {
	fs::read_dir(path)
		.into_iter()
		.flatten()
		.filter_map(Result::ok)
}

#[cfg(test)]
mod tests {
	use super::super::baseline::InstallKind;
	use super::*;

	fn installed(v: &str) -> Baseline {
		Baseline::of_version(Version::parse(v).unwrap())
	}

	fn temp_root() -> PathBuf {
		let base = std::env::temp_dir().join(format!(
			"regrind-update-test-{}-{:?}",
			std::process::id(),
			std::thread::current().id()
		));
		let _ = fs::remove_dir_all(&base);
		fs::create_dir_all(&base).unwrap();
		base
	}

	fn staged(tag: &str, version: &str, verified: bool) -> Staged {
		Staged {
			schema: SCHEMA,
			component: "app".into(),
			kind: InstallKind::Update,
			tag: tag.to_owned(),
			version: version.to_owned(),
			payload_name: "a.apk".into(),
			payload_uuid: "bb49c042".into(),
			payload_size: 4,
			payload_url: "https://git.opengrind.org/a.apk".into(),
			signature_url: "https://git.opengrind.org/a.apk.minisig".into(),
			downloaded: 4,
			validator: None,
			verified,
			payload_digest: verified.then(|| "digest".into()),
		}
	}

	fn write_stage(
		root: &Path,
		tag: &str,
		version: &str,
		verified: bool,
		payload: &[u8],
	) -> Stage {
		write_stage_of(
			root,
			tag,
			version,
			verified,
			payload,
			InstallKind::Update,
		)
	}

	fn write_stage_of(
		root: &Path,
		tag: &str,
		version: &str,
		verified: bool,
		payload: &[u8],
		kind: InstallKind,
	) -> Stage {
		let stage = stage(root, tag).unwrap();
		stage.create().unwrap();
		fs::write(stage.payload(), payload).unwrap();
		let mut state = staged(tag, version, verified);
		state.kind = kind;
		stage.save(&state).unwrap();
		stage
	}

	#[test]
	fn rejects_tags_that_would_escape_the_stage_root() {
		for tag in ["..", "../evil", "a/b", ".hidden", "", &"x".repeat(65)] {
			assert!(!tag_is_safe(tag), "accepted {tag}");
			assert!(stage(Path::new("/tmp"), tag).is_err());
		}
		assert!(tag_is_safe("v0.1.0-beta.3"));
	}

	#[test]
	fn write_durably_replaces_the_file_and_leaves_no_temp_behind() {
		let path = temp_root().join("ledger.json");
		write_durably(&path, b"first").unwrap();
		write_durably(&path, b"second").unwrap();
		assert_eq!(fs::read(&path).unwrap(), b"second");
		assert!(!path.with_extension("json.tmp").exists());
	}

	#[test]
	fn state_survives_a_save_and_load_round_trip() {
		let root = temp_root();
		let stage = write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");
		assert_eq!(stage.load().unwrap(), staged("v0.2.0", "0.2.0", true));
	}

	fn candidate_for(tag: &str, version: &str, kind: InstallKind) -> Candidate {
		Candidate {
			component: "app".into(),
			kind,
			tag: tag.to_owned(),
			version: version.to_owned(),
			notes: None,
			published_at: None,
			payload: super::super::release::Artifact {
				name: "a.apk".into(),
				url: "https://git.opengrind.org/a.apk".into(),
				uuid: "bb49c042".into(),
				size: 4,
			},
			signature: super::super::release::Artifact {
				name: "a.apk.minisig".into(),
				url: "https://git.opengrind.org/a.apk.minisig".into(),
				uuid: "c45b10ab".into(),
				size: 228,
			},
		}
	}

	#[test]
	fn purge_keeps_only_the_active_stage() {
		let root = temp_root();
		write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");
		write_stage(&root, "v0.3.0", "0.3.0", false, b"apk!");
		fs::create_dir_all(root.join("junk")).unwrap();

		purge(
			&component::APP,
			&root,
			&installed("0.1.0"),
			Some(&candidate_for("v0.3.0", "0.3.0", InstallKind::Update)),
		);

		assert!(!root.join("v0.2.0").exists());
		assert!(!root.join("junk").exists());
		assert!(root.join("v0.3.0").exists());
	}

	#[test]
	fn purge_without_a_target_keeps_only_the_newest_staged_update() {
		let root = temp_root();
		write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");
		write_stage(&root, "v0.4.0", "0.4.0", true, b"apk!");
		write_stage(&root, "v0.3.0", "0.3.0", false, b"apk!");

		purge(&component::APP, &root, &installed("0.1.0"), None);

		assert!(root.join("v0.4.0").exists());
		assert!(!root.join("v0.2.0").exists());
		assert!(!root.join("v0.3.0").exists());
	}

	#[test]
	fn purge_drops_versions_the_running_build_has_reached() {
		let root = temp_root();
		write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");

		purge(
			&component::APP,
			&root,
			&installed("0.2.0"),
			Some(&candidate_for("v0.2.0", "0.2.0", InstallKind::Update)),
		);

		assert!(!root.join("v0.2.0").exists());
	}

	#[test]
	fn a_start_keeps_the_stage_of_its_asset_whatever_kind_it_was_staged_as() {
		let root = temp_root();
		write_stage(&root, "v0.1.0", "0.1.0", true, b"apk!");
		let first_install =
			candidate_for("v0.1.0", "0.1.0", InstallKind::Install);

		purge(
			&component::APP,
			&root,
			&Baseline::Absent,
			Some(&first_install),
		);

		assert!(
			root.join("v0.1.0").join(PAYLOAD_FILE).exists(),
			"verified bytes for the very asset being installed must be reused"
		);
	}

	#[test]
	fn a_start_drops_a_stage_of_another_asset_under_the_same_tag() {
		let root = temp_root();
		write_stage(&root, "v0.1.0", "0.1.0", true, b"apk!");
		let mut re_uploaded =
			candidate_for("v0.1.0", "0.1.0", InstallKind::Install);
		re_uploaded.payload.uuid = "99999999".into();

		purge(
			&component::APP,
			&root,
			&Baseline::Absent,
			Some(&re_uploaded),
		);

		assert!(!root.join("v0.1.0").exists());
	}

	#[test]
	fn a_start_for_a_candidate_the_target_no_longer_fits_keeps_nothing() {
		let root = temp_root();
		write_stage(&root, "v0.1.0", "0.1.0", true, b"apk!");

		purge(
			&component::APP,
			&root,
			&installed("0.1.0"),
			Some(&candidate_for("v0.1.0", "0.1.0", InstallKind::Install)),
		);

		assert!(!root.join("v0.1.0").exists());
	}

	#[test]
	fn an_opaque_target_purges_every_stage_it_can_never_accept() {
		let opaque = Baseline::Opaque {
			name: Some("dev".into()),
		};
		for starting in [
			None,
			Some(candidate_for("v1.2.0", "1.2.0", InstallKind::Update)),
		] {
			let root = temp_root();
			write_stage(&root, "v1.2.0", "1.2.0", true, b"apk!");
			write_stage_of(
				&root,
				"v1.3.0",
				"1.3.0",
				false,
				b"ap",
				InstallKind::Install,
			);

			purge(&component::APP, &root, &opaque, starting.as_ref());

			assert!(
				!root.join("v1.2.0").exists() && !root.join("v1.3.0").exists(),
				"no stage is offerable under an opaque version, so none may linger"
			);
		}
	}

	#[test]
	fn verified_ignores_unverified_missing_and_truncated_payloads() {
		let root = temp_root();
		let current = installed("0.1.0");

		write_stage(&root, "v0.2.0", "0.2.0", false, b"apk!");
		assert!(verified(&component::APP, &root, &current).is_none());

		let short = write_stage(&root, "v0.3.0", "0.3.0", true, b"ap");
		assert!(verified(&component::APP, &root, &current).is_none());
		fs::write(short.payload(), b"apk!").unwrap();
		assert_eq!(
			verified(&component::APP, &root, &current).unwrap().1.tag,
			"v0.3.0"
		);

		fs::remove_file(short.payload()).unwrap();
		assert!(verified(&component::APP, &root, &current).is_none());
	}

	#[test]
	fn verified_picks_the_newest_of_several() {
		let root = temp_root();
		write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");
		write_stage(&root, "v0.4.0", "0.4.0", true, b"apk!");
		write_stage(&root, "v0.3.0", "0.3.0", true, b"apk!");

		let (_, found) =
			verified(&component::APP, &root, &installed("0.1.0")).unwrap();
		assert_eq!(found.tag, "v0.4.0");
	}

	#[test]
	fn a_staged_download_remembers_the_published_asset_name() {
		let candidate = Candidate {
			component: "app".into(),
			kind: InstallKind::Update,
			tag: "v0.2.0".into(),
			version: "0.2.0".into(),
			notes: None,
			published_at: None,
			payload: super::super::release::Artifact {
				name: "open-grind-v0.2.0-android.apk".into(),
				url: format!("{}a.apk", super::super::client::origin()),
				uuid: "bb49c042".into(),
				size: 4,
			},
			signature: super::super::release::Artifact {
				name: "open-grind-v0.2.0-android.apk.minisig".into(),
				url: format!("{}a.apk.minisig", super::super::client::origin()),
				uuid: "c45b10ab".into(),
				size: 228,
			},
		};

		let encoded = serde_json::to_vec(&Staged::new(&candidate)).unwrap();
		let decoded: Staged = serde_json::from_slice(&encoded).unwrap();
		let resumed = decoded.candidate().unwrap();

		assert_eq!(resumed.payload.name, candidate.payload.name);
		assert_eq!(resumed.component, "app");
		assert_eq!(resumed.kind, InstallKind::Update);
	}

	#[test]
	fn a_replaced_asset_no_longer_describes_the_staged_bytes() {
		let candidate = Candidate {
			component: "app".into(),
			kind: InstallKind::Update,
			tag: "v0.2.0".into(),
			version: "0.2.0".into(),
			notes: None,
			published_at: None,
			payload: super::super::release::Artifact {
				name: "a.apk".into(),
				url: "https://git.opengrind.org/a.apk".into(),
				uuid: "bb49c042".into(),
				size: 4,
			},
			signature: super::super::release::Artifact {
				name: "a.apk.minisig".into(),
				url: "https://git.opengrind.org/a.apk.minisig".into(),
				uuid: "c45b10ab".into(),
				size: 228,
			},
		};
		let on_disk = staged("v0.2.0", "0.2.0", true);
		assert!(on_disk.describes(&candidate));

		let mut hot_patched = candidate.clone();
		hot_patched.payload.uuid = "99999999".into();
		assert!(!on_disk.describes(&hot_patched));

		let mut resized = candidate.clone();
		resized.payload.size = 5;
		assert!(!on_disk.describes(&resized));
	}

	#[test]
	fn sweep_foreign_keeps_component_directories_and_removes_the_rest() {
		let root = temp_root();
		for component in component::ALL {
			fs::create_dir_all(root.join(component.key)).unwrap();
		}
		fs::create_dir_all(root.join("v0.1.0-beta.4")).unwrap();
		fs::create_dir_all(root.join("v0.2.0")).unwrap();
		fs::write(root.join("stray"), b"x").unwrap();

		sweep_foreign(&root);

		for component in component::ALL {
			assert!(
				root.join(component.key).is_dir(),
				"{} was swept away",
				component.key
			);
		}
		assert!(!root.join("v0.1.0-beta.4").exists());
		assert!(!root.join("v0.2.0").exists());
		assert!(!root.join("stray").exists());
	}

	#[test]
	fn every_component_gets_its_own_root_under_the_shared_one() {
		use tauri::test::{mock_builder, mock_context, noop_assets};

		let app = mock_builder()
			.build(mock_context(noop_assets()))
			.expect("mock app");
		let shared = root(app.handle()).expect("shared root");

		let mut roots = Vec::new();
		for component in component::ALL {
			let scoped =
				component_root(app.handle(), component).expect("scoped root");
			assert_eq!(
				scoped.parent(),
				Some(shared.as_path()),
				"{} must sit under the shared updates root",
				component.key
			);
			assert_ne!(
				scoped, shared,
				"{} must not share the root with every other component",
				component.key
			);
			assert!(!roots.contains(&scoped));
			roots.push(scoped);
		}
		assert_eq!(roots.len(), component::ALL.len());
	}

	#[test]
	fn an_absent_target_keeps_a_stage_that_was_staged_as_an_install() {
		let root = temp_root();
		write_stage_of(
			&root,
			"v0.1.0",
			"0.1.0",
			true,
			b"apk!",
			InstallKind::Install,
		);

		purge(&component::APP, &root, &Baseline::Absent, None);
		assert!(
			root.join("v0.1.0").exists(),
			"nothing is installed, so a first install is still worth keeping"
		);
	}

	#[test]
	fn a_stage_staged_as_an_update_is_void_once_the_target_is_gone() {
		let root = temp_root();
		write_stage(&root, "v0.1.0", "0.1.0", true, b"apk!");

		assert!(
			verified(&component::APP, &root, &installed("0.0.9")).is_some(),
			"while the target is installed the update is offerable"
		);

		assert!(
			verified(&component::APP, &root, &Baseline::Absent).is_none(),
			"installing it would silently restore a package the user removed"
		);
		assert!(resumable(&component::APP, &root, &Baseline::Absent).is_none());

		purge(&component::APP, &root, &Baseline::Absent, None);
		assert!(!root.join("v0.1.0").exists());
	}

	#[test]
	fn an_unreadable_target_purges_nothing_rather_than_guessing() {
		let root = temp_root();
		write_stage(&root, "v9.9.9", "9.9.9", true, b"apk!");
		let unreadable = Baseline::Unreadable {
			why: "probe failed".into(),
		};

		purge(&component::APP, &root, &unreadable, None);
		assert!(
			root.join("v9.9.9").exists(),
			"a transient probe failure must not cost the user the download"
		);
		assert!(verified(&component::APP, &root, &unreadable).is_none());
		assert!(resumable(&component::APP, &root, &unreadable).is_none());
	}

	#[test]
	fn a_stage_belonging_to_another_component_is_never_adopted() {
		let root = temp_root();
		let stage = stage(&root, "v9.9.9").unwrap();
		stage.create().unwrap();
		fs::write(stage.payload(), b"apk!").unwrap();
		let mut state = staged("v9.9.9", "9.9.9", true);
		state.component = "google-oauth".into();
		stage.save(&state).unwrap();

		let baseline = installed("0.1.0");
		assert!(verified(&component::APP, &root, &baseline).is_none());
		assert!(resumable(&component::APP, &root, &baseline).is_none());

		purge(&component::APP, &root, &baseline, None);
		assert!(
			!root.join("v9.9.9").exists(),
			"a foreign stage under our root is junk, not a survivor"
		);
	}

	#[test]
	fn sweep_removes_files_a_crashed_run_left_behind() {
		let root = temp_root();
		let stage = write_stage(&root, "v0.2.0", "0.2.0", true, b"apk!");
		fs::write(stage.part(), b"partial").unwrap();
		fs::write(root.join("v0.2.0").join("payload.apk.1"), b"stray").unwrap();
		fs::write(root.join("v0.2.0").join("state.json.tmp"), b"{}").unwrap();

		stage.sweep_strays().unwrap();

		assert!(stage.payload().exists());
		assert!(stage.part().exists());
		assert!(!root.join("v0.2.0").join("payload.apk.1").exists());
		assert!(!root.join("v0.2.0").join("state.json.tmp").exists());
	}
}
