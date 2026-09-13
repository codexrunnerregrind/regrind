use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::watch;
use wreq::Client;

use super::super::baseline::InstallKind;
use super::super::error::UpdateError;
use super::super::release::Candidate;
use super::retained::Retained;
use super::run::run;
use super::{Phase, Progress, PROGRESS_EVENT};

struct Active {
	component: String,
	kind: InstallKind,
	tag: String,
	uuid: String,
	cancel: Arc<AtomicBool>,
	progress: watch::Receiver<Progress>,
	task: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Default)]
struct Slots {
	active: Mutex<Option<Active>>,
	last: Mutex<Option<Progress>>,
	retained: Retained,
}

#[derive(Default)]
pub struct Downloads {
	starting: tokio::sync::Mutex<()>,
	slots: Arc<Slots>,
}

enum Claim {
	Join(Progress),
	Busy(String),
	Replace(Option<Active>),
}

fn joins_existing(active: &Active, finished: bool, wanted: &Candidate) -> bool {
	active.component == wanted.component
		&& active.kind == wanted.kind
		&& active.tag == wanted.tag
		&& active.uuid == wanted.payload.uuid
		&& !finished
		&& !active.cancel.load(Ordering::SeqCst)
}

impl Downloads {
	pub fn snapshot(&self) -> Option<Progress> {
		if let Some(active) = self.slots.active.lock().unwrap().as_ref() {
			if !active.task.inner().is_finished() {
				return Some(active.progress.borrow().clone());
			}
		}
		self.slots.last.lock().unwrap().clone()
	}

	pub fn forget_retained(&self, component: &str) {
		self.slots.retained.forget(component);
	}

	pub fn forget_retained_update(&self, component: &str) {
		self.slots
			.retained
			.forget_if_kind(component, InstallKind::Update);
	}

	pub fn retain_only(&self, component: &str, candidate: Option<&Candidate>) {
		self.slots.retained.retain_only(component, candidate);
	}

	#[cfg(test)]
	pub(in super::super) fn hold(
		&self,
		stage: &super::super::storage::Stage,
		staged: &super::super::storage::Staged,
	) -> Result<(), UpdateError> {
		self.slots.retained.keep(
			stage,
			staged,
			super::super::verify::Prehash::default(),
		)
	}

	pub fn retained_candidate(&self, component: &str) -> Option<Candidate> {
		self.slots.retained.candidate(component)
	}

	pub async fn cancel(&self, component: &str) {
		let _serialized = self.starting.lock().await;
		if let Some(active) = self.slots.active.lock().unwrap().as_ref() {
			if active.component == component {
				active.cancel.store(true, Ordering::SeqCst);
			}
		}
	}

	pub async fn cancel_and_join(&self, component: &str) {
		let _serialized = self.starting.lock().await;
		let running = {
			let mut slot = self.slots.active.lock().unwrap();
			match slot.as_ref() {
				Some(active) if active.component == component => slot.take(),
				_ => None,
			}
		};
		if let Some(previous) = running {
			previous.cancel.store(true, Ordering::SeqCst);
			let _ = previous.task.await;
		}
	}

	fn claim(&self, candidate: &Candidate) -> Claim {
		let mut slot = self.slots.active.lock().unwrap();
		match slot.as_ref() {
			Some(active)
				if joins_existing(
					active,
					active.task.inner().is_finished(),
					candidate,
				) =>
			{
				Claim::Join(active.progress.borrow().clone())
			}
			Some(active) if busy_elsewhere(active, candidate) => {
				Claim::Busy(active.component.clone())
			}
			_ => Claim::Replace(slot.take()),
		}
	}

	pub async fn start<R: Runtime>(
		&self,
		app: &AppHandle<R>,
		root: PathBuf,
		client: Client,
		candidate: Candidate,
		clear_stale_stages: impl FnOnce(),
	) -> Result<Progress, UpdateError> {
		let _serialized = self.starting.lock().await;
		let previous = match self.claim(&candidate) {
			Claim::Join(progress) => return Ok(progress),
			Claim::Busy(component) => {
				return Err(UpdateError::Busy { component })
			}
			Claim::Replace(previous) => previous,
		};
		if let Some(previous) = previous {
			previous.cancel.store(true, Ordering::SeqCst);
			let _ = previous.task.await;
		}
		clear_stale_stages();

		let cancel = Arc::new(AtomicBool::new(false));
		let initial = Progress::new(&candidate, 0, Phase::Downloading);
		let (sender, receiver) = watch::channel(initial.clone());

		let task = {
			let app = app.clone();
			let cancel = cancel.clone();
			let candidate = candidate.clone();
			let slots = self.slots.clone();
			tauri::async_runtime::spawn(async move {
				let outcome = run(
					&app,
					&root,
					&client,
					&candidate,
					&cancel,
					&sender,
					&slots.retained,
				)
				.await;
				let final_progress = match outcome {
					Ok(received) => {
						Progress::new(&candidate, received, Phase::Ready)
					}
					Err(UpdateError::Canceled) => Progress::new(
						&candidate,
						sender.borrow().received,
						Phase::Canceled,
					),
					Err(error) => Progress::new(
						&candidate,
						sender.borrow().received,
						Phase::Failed(error),
					),
				};
				let _ = sender.send(final_progress.clone());
				let _ = app.emit(PROGRESS_EVENT, &final_progress);
				*slots.last.lock().unwrap() = Some(final_progress);
				*slots.active.lock().unwrap() = None;
			})
		};

		*self.slots.active.lock().unwrap() = Some(Active {
			component: candidate.component.clone(),
			kind: candidate.kind,
			tag: candidate.tag.clone(),
			uuid: candidate.payload.uuid.clone(),
			cancel,
			progress: receiver,
			task,
		});
		Ok(initial)
	}
}

fn busy_elsewhere(active: &Active, wanted: &Candidate) -> bool {
	active.component != wanted.component
		&& !active.task.inner().is_finished()
		&& !active.cancel.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
	use std::time::Duration;

	use super::*;

	fn progress() -> Progress {
		Progress {
			component: "app".into(),
			kind: InstallKind::Update,
			tag: "v1".into(),
			version: "0.2.0".into(),
			phase: Phase::Downloading,
			received: 0,
			total: 10,
		}
	}

	pub(super) fn active_that_stops_when_cancelled(
		stopped: Arc<AtomicBool>,
	) -> (Active, Arc<AtomicBool>) {
		let cancel = Arc::new(AtomicBool::new(false));
		let (sender, receiver) = watch::channel(progress());
		let task = {
			let cancel = cancel.clone();
			tauri::async_runtime::spawn(async move {
				while !cancel.load(Ordering::SeqCst) {
					tokio::task::yield_now().await;
				}
				tokio::time::sleep(Duration::from_millis(50)).await;
				stopped.store(true, Ordering::SeqCst);
				drop(sender);
			})
		};
		(
			Active {
				component: "app".into(),
				kind: InstallKind::Update,
				tag: "v1".into(),
				uuid: "uuid".into(),
				cancel: cancel.clone(),
				progress: receiver,
				task,
			},
			cancel,
		)
	}

	fn offered(tag: &str, uuid: &str) -> Candidate {
		use crate::api::update::release::Artifact;

		Candidate {
			component: "app".into(),
			kind: InstallKind::Update,
			tag: tag.into(),
			version: "0.2.0".into(),
			notes: None,
			published_at: None,
			payload: Artifact {
				name: "a.apk".into(),
				url: "https://git.opengrind.org/a.apk".into(),
				uuid: uuid.into(),
				size: 10,
			},
			signature: Artifact {
				name: "a.apk.minisig".into(),
				url: "https://git.opengrind.org/a.apk.minisig".into(),
				uuid: "sig".into(),
				size: 228,
			},
		}
	}

	fn offered_for(component: &str, tag: &str, uuid: &str) -> Candidate {
		Candidate {
			component: component.into(),
			..offered(tag, uuid)
		}
	}

	#[tokio::test]
	async fn a_transfer_never_joins_one_belonging_to_another_component() {
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, _) = active_that_stops_when_cancelled(stopped);

		assert!(joins_existing(&active, false, &offered("v1", "uuid")));
		assert!(
			!joins_existing(
				&active,
				false,
				&offered_for("google-oauth", "v1", "uuid")
			),
			"two components can publish the same tag and asset uuid"
		);
		active.cancel.store(true, Ordering::SeqCst);
	}

	#[tokio::test]
	async fn cancelling_one_component_leaves_anothers_transfer_alone() {
		let downloads = Downloads::default();
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, cancel) =
			active_that_stops_when_cancelled(stopped.clone());
		*downloads.slots.active.lock().unwrap() = Some(active);

		downloads.cancel("google-oauth").await;
		assert!(
			!cancel.load(Ordering::SeqCst),
			"a cancel aimed at another component must not stop this transfer"
		);

		downloads.cancel_and_join("google-oauth").await;
		assert!(
			downloads.slots.active.lock().unwrap().is_some(),
			"a discard for another component must not take the slot"
		);

		downloads.cancel("app").await;
		assert!(cancel.load(Ordering::SeqCst));
		downloads.cancel_and_join("app").await;
	}

	#[tokio::test]
	async fn a_second_component_is_refused_rather_than_served_by_cancelling() {
		let downloads = Downloads::default();
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, cancel) =
			active_that_stops_when_cancelled(stopped.clone());
		*downloads.slots.active.lock().unwrap() = Some(active);

		let refused =
			downloads.claim(&offered_for("google-oauth", "v9", "other"));

		assert!(
			matches!(refused, Claim::Busy(ref component) if component == "app"),
			"expected Busy naming the running component"
		);
		assert!(
			!cancel.load(Ordering::SeqCst),
			"the running download must not be cancelled by the refusal"
		);
		assert!(
			downloads.slots.active.lock().unwrap().is_some(),
			"the running download must still hold the slot"
		);

		cancel.store(true, Ordering::SeqCst);
		downloads.cancel_and_join("app").await;
	}

	#[tokio::test]
	async fn a_finished_transfer_does_not_block_another_component() {
		let downloads = Downloads::default();
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, cancel) =
			active_that_stops_when_cancelled(stopped.clone());
		*downloads.slots.active.lock().unwrap() = Some(active);
		cancel.store(true, Ordering::SeqCst);
		while !stopped.load(Ordering::SeqCst) {
			tokio::task::yield_now().await;
		}

		assert!(
			matches!(
				downloads.claim(&offered_for("google-oauth", "v9", "other")),
				Claim::Replace(Some(_))
			),
			"a cancelled or finished transfer must not hold the lane"
		);
	}

	#[tokio::test]
	async fn a_re_uploaded_asset_never_joins_the_transfer_it_replaced() {
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, _) = active_that_stops_when_cancelled(stopped);

		assert!(
			joins_existing(&active, false, &offered("v1", "uuid")),
			"the same asset must join the transfer already running"
		);
		assert!(
			!joins_existing(&active, false, &offered("v1", "replaced")),
			"a re-uploaded asset shares the tag but is different bytes"
		);
		assert!(!joins_existing(&active, true, &offered("v1", "uuid")));
		active.cancel.store(true, Ordering::SeqCst);
	}

	#[tokio::test]
	async fn a_first_install_never_joins_an_update_of_the_same_asset() {
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, _) = active_that_stops_when_cancelled(stopped);

		assert!(
			!joins_existing(
				&active,
				false,
				&Candidate {
					kind: InstallKind::Install,
					..offered("v1", "uuid")
				}
			),
			"a joined update would finish with a label the removed target refuses"
		);
		active.cancel.store(true, Ordering::SeqCst);
	}

	#[tokio::test]
	async fn claiming_the_same_asset_joins_the_transfer_already_running() {
		let downloads = Downloads::default();
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, cancel) =
			active_that_stops_when_cancelled(stopped.clone());
		*downloads.slots.active.lock().unwrap() = Some(active);

		assert!(matches!(
			downloads.claim(&offered("v1", "uuid")),
			Claim::Join(ref progress) if progress.tag == "v1"
		));

		assert!(!cancel.load(Ordering::SeqCst));
		assert!(downloads.slots.active.lock().unwrap().is_some());
		cancel.store(true, Ordering::SeqCst);
	}

	#[tokio::test]
	async fn claiming_a_different_asset_takes_the_slot_to_replace_it() {
		let downloads = Downloads::default();
		let (active, _) =
			active_that_stops_when_cancelled(Arc::new(AtomicBool::new(false)));
		*downloads.slots.active.lock().unwrap() = Some(active);

		let Claim::Replace(Some(previous)) =
			downloads.claim(&offered("v2", "other"))
		else {
			panic!("a different asset must replace the running transfer");
		};

		assert!(downloads.slots.active.lock().unwrap().is_none());
		previous.cancel.store(true, Ordering::SeqCst);
		let _ = previous.task.await;
	}

	#[tokio::test]
	async fn cancel_and_join_returns_only_after_the_transfer_has_stopped() {
		let downloads = Downloads::default();
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, cancel) =
			active_that_stops_when_cancelled(stopped.clone());
		*downloads.slots.active.lock().unwrap() = Some(active);

		downloads.cancel_and_join("app").await;

		assert!(
			cancel.load(Ordering::SeqCst),
			"the transfer was never asked to stop"
		);
		assert!(
			stopped.load(Ordering::SeqCst),
			"discard would delete the stage while the transfer is still writing to it"
		);
		assert!(downloads.slots.active.lock().unwrap().is_none());
	}

	#[tokio::test]
	async fn cancel_and_join_with_nothing_running_is_a_no_op() {
		Downloads::default().cancel_and_join("app").await;
	}
}

#[cfg(test)]
mod end_to_end {
	use std::path::PathBuf;
	use std::time::Duration;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

	use super::super::testserver::{self, Plan};
	use super::*;
	use crate::api::update::release::Artifact;

	struct Root(PathBuf);

	impl Drop for Root {
		fn drop(&mut self) {
			let _ = std::fs::remove_dir_all(&self.0);
		}
	}

	fn root(name: &str) -> Root {
		let path = std::env::temp_dir()
			.join(format!("og-discard-{}-{name}", std::process::id()));
		let _ = std::fs::remove_dir_all(&path);
		Root(path)
	}

	fn candidate(url: &str, size: u64) -> Candidate {
		Candidate {
			component: "app".into(),
			kind: InstallKind::Update,
			tag: "v99".into(),
			version: "99.0.0".into(),
			notes: None,
			published_at: None,
			payload: Artifact {
				name: "a.apk".into(),
				url: url.to_owned(),
				uuid: "uuid".into(),
				size,
			},
			signature: Artifact {
				name: "a.apk.minisig".into(),
				url: format!("{url}.minisig"),
				uuid: "sig".into(),
				size: 228,
			},
		}
	}

	fn app() -> tauri::App<MockRuntime> {
		mock_builder()
			.build(mock_context(noop_assets()))
			.expect("mock app")
	}

	fn running_app_transfer(
		downloads: &Downloads,
	) -> (Arc<AtomicBool>, Arc<AtomicBool>) {
		let stopped = Arc::new(AtomicBool::new(false));
		let (active, cancel) =
			super::tests::active_that_stops_when_cancelled(stopped.clone());
		*downloads.slots.active.lock().unwrap() = Some(active);
		(stopped, cancel)
	}

	#[tokio::test]
	async fn a_second_start_for_the_running_asset_leaves_its_stage_alone() {
		let server = testserver::spawn(Plan {
			body: vec![7; 10],
			etag: Some("\"uuid\"".into()),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("join-keeps-stage");
		let downloads = Downloads::default();
		let (_, cancel) = running_app_transfer(&downloads);
		let unsaved_stage = root.0.join("v1");
		std::fs::create_dir_all(&unsaved_stage).unwrap();
		let cleared = AtomicBool::new(false);
		let running = Candidate {
			tag: "v1".into(),
			..candidate(&server.url(), 10)
		};

		let joined = downloads
			.start(
				app.handle(),
				root.0.clone(),
				Client::builder().build().expect("client"),
				running.clone(),
				|| {
					cleared.store(true, Ordering::SeqCst);
					crate::api::update::storage::purge(
						&crate::api::update::component::APP,
						&root.0,
						&crate::api::update::baseline::Baseline::of_version(
							semver::Version::new(0, 1, 0),
						),
						Some(&running),
					);
				},
			)
			.await
			.unwrap();

		assert_eq!(joined.tag, "v1");
		assert!(
			!cleared.load(Ordering::SeqCst),
			"joining a transfer must never clear stages"
		);
		assert!(
			unsaved_stage.exists(),
			"a stage whose sidecar is not written yet belongs to the running transfer"
		);
		cancel.store(true, Ordering::SeqCst);
		downloads.cancel_and_join("app").await;
	}

	#[tokio::test]
	async fn a_verified_update_is_installed_from_disk_after_its_target_was_removed(
	) {
		use crate::api::update::baseline::Baseline;
		use crate::api::update::component::GOOGLE_OAUTH;
		use crate::api::update::storage::{self, Staged};

		let server = testserver::spawn(Plan {
			body: b"apk!".to_vec(),
			etag: Some("\"uuid\"".into()),
			signature_status: Some(404),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("verified-update-reinstalled");
		let update = Candidate {
			component: GOOGLE_OAUTH.key.into(),
			..candidate(&server.url(), 4)
		};
		let stage = storage::stage(&root.0, &update.tag).unwrap();
		stage.create().unwrap();
		std::fs::write(stage.payload(), b"apk!").unwrap();
		stage
			.save(&Staged {
				downloaded: 4,
				verified: true,
				payload_digest: Some("digest".into()),
				..Staged::new(&update)
			})
			.unwrap();
		let first_install = Candidate {
			kind: InstallKind::Install,
			..update
		};
		let downloads = Downloads::default();

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				Client::builder().build().expect("client"),
				first_install.clone(),
				|| {
					storage::purge(
						&GOOGLE_OAUTH,
						&root.0,
						&Baseline::Absent,
						Some(&first_install),
					)
				},
			)
			.await
			.unwrap();

		let mut settled = None;
		for _ in 0..400 {
			match downloads.snapshot().map(|progress| progress.phase) {
				Some(Phase::Downloading) | None => {
					tokio::time::sleep(Duration::from_millis(5)).await;
				}
				phase => {
					settled = phase;
					break;
				}
			}
		}
		downloads.cancel_and_join(GOOGLE_OAUTH.key).await;

		assert!(
			matches!(settled, Some(Phase::Ready)),
			"the verified bytes on disk must be reused, got {settled:?}"
		);
		let (_, reused) =
			storage::verified(&GOOGLE_OAUTH, &root.0, &Baseline::Absent)
				.expect(
					"the reused stage must be installable as a first install",
				);
		assert_eq!(reused.kind, InstallKind::Install);
	}

	#[tokio::test]
	async fn a_first_install_takes_over_a_running_update_and_resumes_its_bytes()
	{
		use crate::api::update::component::GOOGLE_OAUTH;
		use crate::api::update::storage;

		let large: Vec<u8> =
			(0..8 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			pause_every_64k: Some(Duration::from_millis(5)),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("install-takes-over-update");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");
		let update = Candidate {
			component: GOOGLE_OAUTH.key.into(),
			..candidate(&server.url(), large.len() as u64)
		};
		let first_install = Candidate {
			kind: InstallKind::Install,
			..update.clone()
		};

		downloads
			.start(app.handle(), root.0.clone(), client.clone(), update, || ())
			.await
			.unwrap();
		let stage = storage::stage(&root.0, &first_install.tag).unwrap();
		for _ in 0..400 {
			if std::fs::metadata(stage.part()).is_ok_and(|m| m.len() > 0) {
				break;
			}
			tokio::time::sleep(Duration::from_millis(5)).await;
		}
		assert!(
			std::fs::metadata(stage.part()).is_ok_and(|m| m.len() > 0),
			"the update transfer never started writing"
		);

		let cleared = AtomicBool::new(false);
		downloads
			.start(app.handle(), root.0.clone(), client, first_install, || {
				cleared.store(true, Ordering::SeqCst)
			})
			.await
			.unwrap();

		assert!(
			cleared.load(Ordering::SeqCst),
			"a first install joined the running update, so it would finish labelled as an update"
		);
		let replaced = downloads
			.slots
			.last
			.lock()
			.unwrap()
			.clone()
			.expect("the update transfer reported how it ended");
		assert!(
			matches!(replaced.phase, Phase::Canceled),
			"the update transfer must be cancelled, got {:?}",
			replaced.phase
		);
		let kept = replaced.received;
		assert!(kept > 0, "the test needs bytes to have landed");

		let mut range = None;
		let mut relabelled = None;
		for _ in 0..400 {
			range = server.last_range.lock().unwrap().clone();
			relabelled = stage.load().map(|staged| staged.kind);
			if range.is_some() && relabelled.is_some() {
				break;
			}
			tokio::time::sleep(Duration::from_millis(5)).await;
		}
		downloads.cancel_and_join(GOOGLE_OAUTH.key).await;

		assert_eq!(
			range,
			Some(format!("bytes={kept}-")),
			"the first install must resume the bytes the update kept"
		);
		assert_eq!(
			relabelled,
			Some(InstallKind::Install),
			"the resumed stage must be labelled as a first install"
		);
	}

	#[tokio::test]
	async fn a_replacing_start_clears_stages_only_after_the_old_transfer_stopped(
	) {
		let server = testserver::spawn(Plan {
			body: vec![7; 10],
			etag: Some("\"uuid\"".into()),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("replace-after-stop");
		let downloads = Downloads::default();
		let (stopped, _) = running_app_transfer(&downloads);
		let cleared = AtomicBool::new(false);
		let cleared_after_stop = AtomicBool::new(false);

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				Client::builder().build().expect("client"),
				candidate(&server.url(), 10),
				|| {
					cleared.store(true, Ordering::SeqCst);
					cleared_after_stop.store(
						stopped.load(Ordering::SeqCst),
						Ordering::SeqCst,
					);
				},
			)
			.await
			.unwrap();
		downloads.cancel_and_join("app").await;

		assert!(cleared.load(Ordering::SeqCst));
		assert!(
			cleared_after_stop.load(Ordering::SeqCst),
			"clearing stages before the old transfer stopped is what broke the handover"
		);
	}

	#[tokio::test]
	async fn a_start_refused_as_busy_leaves_every_stage_alone() {
		let server = testserver::spawn(Plan {
			body: vec![7; 10],
			etag: Some("\"uuid\"".into()),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("busy-keeps-stages");
		let downloads = Downloads::default();
		let (_, cancel) = running_app_transfer(&downloads);
		let cleared = AtomicBool::new(false);

		let refused = downloads
			.start(
				app.handle(),
				root.0.clone(),
				Client::builder().build().expect("client"),
				Candidate {
					component: "google-oauth".into(),
					..candidate(&server.url(), 10)
				},
				|| cleared.store(true, Ordering::SeqCst),
			)
			.await;

		assert!(
			matches!(refused, Err(UpdateError::Busy { ref component }) if component == "app"),
			"expected Busy, got {refused:?}"
		);
		assert!(!cleared.load(Ordering::SeqCst));
		cancel.store(true, Ordering::SeqCst);
		downloads.cancel_and_join("app").await;
	}

	#[tokio::test]
	async fn discarding_a_live_download_cancels_it_and_frees_the_stage() {
		let large: Vec<u8> =
			(0..8 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("live");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				client,
				candidate(&server.url(), large.len() as u64),
				|| (),
			)
			.await
			.unwrap();

		let stage = crate::api::update::storage::stage(&root.0, "v99").unwrap();
		for _ in 0..400 {
			if std::fs::metadata(stage.part()).is_ok_and(|m| m.len() > 0) {
				break;
			}
			tokio::time::sleep(Duration::from_millis(5)).await;
		}
		assert!(
			std::fs::metadata(stage.part()).is_ok_and(|m| m.len() > 0),
			"the transfer never started writing"
		);

		downloads.cancel_and_join("app").await;
		std::fs::remove_dir_all(&root.0)
			.expect("discard must be able to delete the stage");

		let phase = downloads.snapshot().expect("a final progress").phase;
		assert!(
			matches!(phase, Phase::Canceled),
			"a discarded download must report Canceled, got {phase:?}"
		);
	}

	#[tokio::test]
	async fn a_ceiling_stops_a_transfer_that_only_ever_dribbles() {
		let large: Vec<u8> =
			(0..5 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			stop_body_after: Some(64 * 1024),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("dribble");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				client,
				candidate(&server.url(), large.len() as u64),
				|| (),
			)
			.await
			.unwrap();

		let mut settled = None;
		for _ in 0..4000 {
			match downloads.snapshot().map(|progress| progress.phase) {
				Some(Phase::Downloading) | None => {
					tokio::time::sleep(Duration::from_millis(5)).await;
				}
				phase => {
					settled = phase;
					break;
				}
			}
		}
		downloads.cancel_and_join("app").await;

		assert!(
			matches!(settled, Some(Phase::Failed(_))),
			"progress must not buy unlimited attempts, got {settled:?}"
		);
	}

	#[tokio::test]
	async fn a_transfer_that_keeps_advancing_outlives_the_stall_budget() {
		let large: Vec<u8> =
			(0..12 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			stop_body_after: Some(1024 * 1024),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("advancing");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				client,
				candidate(&server.url(), large.len() as u64),
				|| (),
			)
			.await
			.unwrap();

		let stage = crate::api::update::storage::stage(&root.0, "v99").unwrap();
		for _ in 0..2000 {
			if downloads
				.snapshot()
				.is_some_and(|progress| progress.phase != Phase::Downloading)
			{
				break;
			}
			tokio::time::sleep(Duration::from_millis(5)).await;
		}

		let reached = std::fs::metadata(stage.part())
			.map(|meta| meta.len())
			.unwrap_or(large.len() as u64);
		downloads.cancel_and_join("app").await;
		assert!(
			reached >= large.len() as u64,
			"a cut every megabyte must not spend a fixed attempt budget: stopped at {reached} of {}",
			large.len()
		);
	}

	#[tokio::test]
	async fn a_cancelled_download_leaves_the_disk_clean_and_resumes_from_memory(
	) {
		let large: Vec<u8> =
			(0..8 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			pause_every_64k: Some(Duration::from_millis(5)),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("resume-from-memory");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");
		let candidate = candidate(&server.url(), large.len() as u64);

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				client.clone(),
				candidate.clone(),
				|| (),
			)
			.await
			.unwrap();

		let stage = crate::api::update::storage::stage(&root.0, "v99").unwrap();
		for _ in 0..400 {
			if std::fs::metadata(stage.part()).is_ok_and(|m| m.len() > 0) {
				break;
			}
			tokio::time::sleep(Duration::from_millis(5)).await;
		}
		downloads.cancel_and_join("app").await;

		let final_progress = downloads.snapshot().expect("a final progress");
		assert!(
			matches!(final_progress.phase, Phase::Canceled),
			"the transfer outran the cancel: {:?}",
			final_progress.phase
		);
		let kept = final_progress.received;
		assert!(kept > 0, "the test needs bytes to have landed");
		assert!(!stage.part().exists(), "cancelling must clear the disk");
		assert!(
			stage.load().is_none(),
			"cancelling must clear the sidecar too"
		);
		let current = semver::Version::parse("0.1.0").unwrap();
		assert!(
			crate::api::update::storage::resumable(
				&crate::api::update::component::APP,
				&root.0,
				&crate::api::update::baseline::Baseline::of_version(
					current.clone()
				),
			)
			.is_none(),
			"nothing on disk means nothing to resume from disk"
		);

		downloads
			.start(app.handle(), root.0.clone(), client, candidate, || ())
			.await
			.unwrap();
		for _ in 0..400 {
			if server.last_range.lock().unwrap().is_some() {
				break;
			}
			tokio::time::sleep(Duration::from_millis(5)).await;
		}
		let range = server.last_range.lock().unwrap().clone();
		downloads.cancel_and_join("app").await;

		assert_eq!(
			range,
			Some(format!("bytes={kept}-")),
			"the resumed request must ask only for what was not kept"
		);
	}

	#[tokio::test]
	async fn a_release_whose_signature_cannot_be_fetched_stops_early() {
		let large: Vec<u8> =
			(0..8 * 1024 * 1024u32).map(|i| (i % 251) as u8).collect();
		let server = testserver::spawn(Plan {
			body: large.clone(),
			etag: Some("\"uuid\"".into()),
			signature_status: Some(404),
			..Plan::default()
		})
		.await;
		let app = app();
		let root = root("nosig");
		let downloads = Downloads::default();
		let client = Client::builder().build().expect("client");

		downloads
			.start(
				app.handle(),
				root.0.clone(),
				client,
				candidate(&server.url(), large.len() as u64),
				|| (),
			)
			.await
			.unwrap();

		let mut phase = None;
		for _ in 0..400 {
			match downloads.snapshot().map(|progress| progress.phase) {
				Some(Phase::Downloading) | None => {
					tokio::time::sleep(Duration::from_millis(5)).await;
				}
				settled => {
					phase = settled;
					break;
				}
			}
		}

		assert!(
			matches!(phase, Some(Phase::Failed(UpdateError::Server { .. }))),
			"a missing signature must fail the download, got {phase:?}"
		);
		let stage = crate::api::update::storage::stage(&root.0, "v99").unwrap();
		let written = std::fs::metadata(stage.part())
			.map(|meta| meta.len())
			.unwrap_or(0);
		assert!(
			written < large.len() as u64,
			"the payload must not be pulled in full once the signature is known to be missing"
		);
	}
}
