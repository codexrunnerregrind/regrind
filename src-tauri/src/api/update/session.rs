use std::path::PathBuf;

use tauri::AppHandle;

use super::baseline::{Baseline, Channel};
use super::component::Component;
use super::error::UpdateError;
use super::install::{self, Capability, Unsupported};
use super::release::{self, Candidate};
use super::storage;

pub(super) struct Session {
	pub(super) component: &'static Component,
	pub(super) root: PathBuf,
	pub(super) baseline: Baseline,
	pub(super) channel: Channel,
	pub(super) payload_suffix: String,
	pub(super) can_install_now: bool,
}

impl Session {
	pub(super) fn open(
		app: &AppHandle,
		component: &'static Component,
	) -> Result<Self, UpdateError> {
		let (payload_suffix, can_install_now) =
			match install::capability_for(app, component) {
				Capability::Supported {
					payload_suffix,
					can_install_now,
				} => (payload_suffix, can_install_now),
				Capability::Unsupported(reason) => {
					return Err(UpdateError::Unsupported(reason))
				}
			};
		let baseline = readable(component, install::probe(app, component))?;
		Ok(Self {
			component,
			root: storage::component_root(app, component)?,
			baseline,
			channel: Channel::of_host(&super::current_version(app)),
			payload_suffix,
			can_install_now,
		})
	}

	pub(super) fn newest_upgrade(
		&self,
		index: &str,
	) -> Result<Option<Candidate>, UpdateError> {
		release::newest_upgrade(
			index,
			self.component,
			&self.baseline,
			self.channel,
			&self.payload_suffix,
		)
	}
}

fn readable(
	component: &Component,
	baseline: Baseline,
) -> Result<Baseline, UpdateError> {
	if let Baseline::Unreadable { why } = &baseline {
		tracing::warn!("[update] {} state unreadable: {why}", component.key);
		return Err(UpdateError::Unsupported(Unsupported::Undetermined));
	}
	Ok(baseline)
}

#[cfg(test)]
mod tests {
	use super::super::component::GOOGLE_OAUTH;
	use super::*;

	#[test]
	fn an_unreadable_target_is_undetermined_rather_than_nothing_published() {
		let refused = readable(
			&GOOGLE_OAUTH,
			Baseline::Unreadable {
				why: "unknown-target".into(),
			},
		);
		assert!(
			matches!(
				refused,
				Err(UpdateError::Unsupported(Unsupported::Undetermined))
			),
			"{refused:?}"
		);
	}

	#[test]
	fn every_readable_target_passes_through_unchanged() {
		for baseline in [
			Baseline::Absent,
			Baseline::of_version(semver::Version::new(1, 1, 0)),
			Baseline::Opaque {
				name: Some("build-7".into()),
			},
		] {
			assert_eq!(
				readable(&GOOGLE_OAUTH, baseline.clone()).unwrap(),
				baseline
			);
		}
	}
}
