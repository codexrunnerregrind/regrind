use std::collections::BTreeMap;
use std::sync::Mutex;

use super::super::baseline::InstallKind;
use super::super::error::UpdateError;
use super::super::release::Candidate;
use super::super::storage::{Stage, Staged};
use super::super::verify::Prehash;
use super::body::Body;

struct Held {
	staged: Staged,
	body: Body,
	digest: Prehash,
}

#[derive(Default)]
pub(super) struct Retained(Mutex<BTreeMap<String, Held>>);

impl Retained {
	pub(super) fn keep(
		&self,
		stage: &Stage,
		staged: &Staged,
		digest: Prehash,
	) -> Result<(), UpdateError> {
		match Body::take(&stage.part())? {
			None => self.forget(&staged.component),
			Some(body) => {
				let mut staged = staged.clone();
				staged.downloaded = body.length();
				self.0.lock().unwrap().insert(
					staged.component.clone(),
					Held {
						staged,
						body,
						digest,
					},
				);
			}
		}
		stage.discard()
	}

	pub(super) fn restore(
		&self,
		stage: &Stage,
		candidate: &Candidate,
		staged: &mut Staged,
		digest: &mut Prehash,
	) -> Result<(), UpdateError> {
		let mut held = {
			let mut slots = self.0.lock().unwrap();
			match slots.get(&candidate.component) {
				Some(held) if held.staged.describes(candidate) => {
					slots.remove(&candidate.component).unwrap()
				}
				Some(_) => {
					slots.remove(&candidate.component);
					return Ok(());
				}
				None => return Ok(()),
			}
		};

		let written = stage
			.create()
			.and_then(|()| held.body.write_back(&stage.part()));
		if let Err(error) = written {
			self.0
				.lock()
				.unwrap()
				.insert(candidate.component.clone(), held);
			return Err(error);
		}
		*staged = Staged {
			kind: candidate.kind,
			..held.staged
		};
		stage.save(staged)?;
		*digest = held.digest;
		Ok(())
	}

	pub(super) fn candidate(&self, component: &str) -> Option<Candidate> {
		let slots = self.0.lock().unwrap();
		slots.get(component)?.staged.clone().candidate()
	}

	pub(super) fn forget(&self, component: &str) {
		self.0.lock().unwrap().remove(component);
	}

	pub(super) fn forget_if_kind(&self, component: &str, kind: InstallKind) {
		let mut slots = self.0.lock().unwrap();
		if slots
			.get(component)
			.is_some_and(|held| held.staged.kind == kind)
		{
			slots.remove(component);
		}
	}

	pub(super) fn retain_only(
		&self,
		component: &str,
		candidate: Option<&Candidate>,
	) {
		let mut slots = self.0.lock().unwrap();
		let kept = slots
			.get(component)
			.zip(candidate)
			.is_some_and(|(held, wanted)| held.staged.describes(wanted));
		if !kept {
			slots.remove(component);
		}
	}
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::PathBuf;

	use super::super::super::release::Artifact;
	use super::super::super::{client, storage, verify};
	use super::*;

	fn hex(bytes: &[u8]) -> String {
		bytes.iter().map(|byte| format!("{byte:02x}")).collect()
	}

	fn root(name: &str) -> PathBuf {
		let root = std::env::temp_dir()
			.join(format!("og-retained-{}-{name}", std::process::id()));
		let _ = fs::remove_dir_all(&root);
		root
	}

	fn asset(uuid: &str) -> Candidate {
		Candidate {
			component: "app".into(),
			kind: InstallKind::Update,
			tag: "v0.2.0".into(),
			version: "0.2.0".into(),
			notes: None,
			published_at: None,
			payload: Artifact {
				name: "og.apk".into(),
				url: format!("{}og.apk", client::origin()),
				uuid: uuid.to_owned(),
				size: 8,
			},
			signature: Artifact {
				name: "og.apk.minisig".into(),
				url: format!("{}og.apk.minisig", client::origin()),
				uuid: "sig".into(),
				size: 228,
			},
		}
	}

	fn staged_for(candidate: &Candidate, downloaded: u64) -> Staged {
		let mut staged = Staged::new(candidate);
		staged.downloaded = downloaded;
		staged.validator = Some("\"etag\"".into());
		staged
	}

	fn asset_of(component: &str, uuid: &str) -> Candidate {
		Candidate {
			component: component.into(),
			..asset(uuid)
		}
	}

	#[test]
	fn one_components_hold_is_untouched_by_another_components_activity() {
		let root = root("two-components");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();

		let mine = asset_of("app", "uuid");
		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&mine, 4), Prehash::default())
			.unwrap();
		assert!(retained.candidate("app").is_some());

		let theirs = asset_of("google-oauth", "other-uuid");
		retained.retain_only("google-oauth", Some(&theirs));
		retained.forget("google-oauth");

		let mut restored = Staged::new(&theirs);
		let mut digest = Prehash::default();
		let other_stage = storage::stage(&root, "v9.9.9").unwrap();
		retained
			.restore(&other_stage, &theirs, &mut restored, &mut digest)
			.unwrap();

		assert!(
			retained.candidate("app").is_some(),
			"another component must not be able to drop my retained bytes"
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_hold_is_only_restored_into_its_own_component() {
		let root = root("wrong-component");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();

		let mine = asset_of("app", "uuid");
		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&mine, 4), Prehash::default())
			.unwrap();

		let impostor = asset_of("google-oauth", "uuid");
		let mut restored = Staged::new(&impostor);
		let mut digest = Prehash::default();
		retained
			.restore(&stage, &impostor, &mut restored, &mut digest)
			.unwrap();

		assert!(
			!stage.part().exists(),
			"the bytes must not be written back for a different component"
		);
		assert!(retained.candidate("app").is_some());
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn keeping_a_cancelled_download_leaves_nothing_on_disk() {
		let root = root("keep");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let candidate = asset("uuid");
		let staged = staged_for(&candidate, 4);
		stage.save(&staged).unwrap();

		let mut hashed = Prehash::default();
		hashed.update(b"half");
		let retained = Retained::default();
		retained.keep(&stage, &staged, hashed).unwrap();

		assert!(!stage.part().exists(), "the part file must be gone");
		assert!(
			stage.load().is_none(),
			"the sidecar must be gone with the bytes"
		);

		let mut restored = Staged::new(&candidate);
		let mut digest = Prehash::default();
		retained
			.restore(&stage, &candidate, &mut restored, &mut digest)
			.unwrap();
		assert_eq!(fs::read(stage.part()).unwrap(), b"half");
		assert_eq!(restored.downloaded, 4);
		assert_eq!(
			restored.validator.as_deref(),
			Some("\"etag\""),
			"the resume validator has to survive the round trip"
		);
		assert_eq!(
			digest.hashed(),
			4,
			"a resume must not have to re-read what it kept"
		);
		assert_eq!(
			hex(&digest.finish()),
			verify::payload_digest(&stage.part()).unwrap()
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_hold_can_name_the_release_it_belongs_to() {
		let root = root("candidate");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let candidate = asset("uuid");

		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&candidate, 4), Prehash::default())
			.unwrap();

		let named = retained.candidate("app").expect(
			"a cancelled download stays startable without a fresh check",
		);
		assert_eq!(named.tag, candidate.tag);
		assert_eq!(named.payload.url, candidate.payload.url);
		assert_eq!(named.payload.uuid, candidate.payload.uuid);
		assert_eq!(named.payload.size, candidate.payload.size);
		assert_eq!(named.signature.url, candidate.signature.url);
		assert!(
			Staged::new(&named).describes(&candidate),
			"the synthesized candidate must still match what was kept"
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_replaced_asset_drops_what_was_kept() {
		let root = root("stale");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let candidate = asset("uuid");
		let staged = staged_for(&candidate, 4);

		let retained = Retained::default();
		retained.keep(&stage, &staged, Prehash::default()).unwrap();

		let replaced = asset("another-uuid");
		let mut restored = Staged::new(&replaced);
		let mut digest = Prehash::default();
		retained
			.restore(&stage, &replaced, &mut restored, &mut digest)
			.unwrap();

		assert!(
			!stage.part().exists(),
			"bytes for a replaced asset must never be written back"
		);
		assert_eq!(restored.downloaded, 0);

		let mut again = Staged::new(&candidate);
		retained
			.restore(&stage, &candidate, &mut again, &mut digest)
			.unwrap();
		assert_eq!(
			again.downloaded, 0,
			"a stale hold is dropped, not kept for later"
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn discarding_the_update_drops_the_bytes_it_was_holding() {
		let root = root("forget");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let candidate = asset("uuid");

		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&candidate, 4), Prehash::default())
			.unwrap();
		retained.forget("app");

		assert!(retained.candidate("app").is_none());
		let mut restored = Staged::new(&candidate);
		let mut digest = Prehash::default();
		retained
			.restore(&stage, &candidate, &mut restored, &mut digest)
			.unwrap();
		assert!(
			!stage.part().exists(),
			"a forgotten hold must never come back"
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_re_check_that_only_changed_the_notes_keeps_the_hold() {
		let root = root("retain-only");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let candidate = asset("uuid");

		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&candidate, 4), Prehash::default())
			.unwrap();

		let edited = Candidate {
			notes: Some("# edited after the upload".into()),
			published_at: Some("2026-08-16T00:00:00Z".into()),
			..candidate.clone()
		};
		retained.retain_only("app", Some(&edited));
		assert!(
			retained.candidate("app").is_some(),
			"only the asset identity may invalidate a hold"
		);

		retained.retain_only("app", Some(&asset("another-uuid")));
		assert!(retained.candidate("app").is_none());
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_hold_restored_for_a_first_install_is_relabelled_as_an_install() {
		let root = root("relabel");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let paused_update = asset("uuid");

		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&paused_update, 4), Prehash::default())
			.unwrap();

		let first_install = Candidate {
			kind: InstallKind::Install,
			..asset("uuid")
		};
		retained.retain_only("app", Some(&first_install));
		let mut restored = Staged::new(&first_install);
		let mut digest = Prehash::default();
		retained
			.restore(&stage, &first_install, &mut restored, &mut digest)
			.unwrap();

		assert_eq!(restored.downloaded, 4, "the kept bytes must be reused");
		assert_eq!(restored.kind, InstallKind::Install);
		assert_eq!(
			stage.load().unwrap().kind,
			InstallKind::Install,
			"an update label on a removed target makes the stage uninstallable"
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn withdrawing_updates_keeps_a_paused_first_install() {
		let root = root("withdraw");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let first_install = Candidate {
			kind: InstallKind::Install,
			..asset_of("google-oauth", "uuid")
		};

		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&first_install, 4), Prehash::default())
			.unwrap();
		retained.forget_if_kind("google-oauth", InstallKind::Update);

		assert!(
			retained.candidate("google-oauth").is_some(),
			"an unattended tick must not discard bytes the user asked for"
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn withdrawing_updates_drops_a_paused_update() {
		let root = root("withdraw-update");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let paused_update = asset_of("google-oauth", "uuid");

		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&paused_update, 4), Prehash::default())
			.unwrap();
		retained.forget_if_kind("google-oauth", InstallKind::Update);

		assert!(retained.candidate("google-oauth").is_none());
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn cancelling_before_a_single_byte_lands_holds_nothing() {
		let root = root("empty");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		let candidate = asset("uuid");
		let staged = staged_for(&candidate, 0);

		let retained = Retained::default();
		retained.keep(&stage, &staged, Prehash::default()).unwrap();

		let mut restored = Staged::new(&candidate);
		let mut digest = Prehash::default();
		retained
			.restore(&stage, &candidate, &mut restored, &mut digest)
			.unwrap();
		assert!(!stage.part().exists());
		assert_eq!(restored.downloaded, 0);
		let _ = fs::remove_dir_all(&root);
	}
}
