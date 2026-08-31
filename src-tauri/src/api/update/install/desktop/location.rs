use std::path::{Path, PathBuf};

const SHARED: &str = "/Applications";

pub fn enforce() {
	if cfg!(debug_assertions) {
		return;
	}
	let Ok(exe) = std::env::current_exe() else {
		return;
	};
	let Some(bundle) = super::enclosing_bundle(&exe) else {
		return;
	};
	if installed(&bundle) {
		return;
	}

	rfd::MessageDialog::new()
		.set_level(rfd::MessageLevel::Error)
		.set_title("Move ReGrind to Applications")
		.set_description(format!(
			"ReGrind updates itself in place, so it has to run from {SHARED}."
		))
		.set_buttons(rfd::MessageButtons::OkCustom("Quit".to_owned()))
		.show();
	std::process::exit(1);
}

fn installed(bundle: &Path) -> bool {
	let Some(parent) = bundle.parent() else {
		return false;
	};
	parent == Path::new(SHARED) || Some(parent.to_path_buf()) == personal()
}

fn personal() -> Option<PathBuf> {
	std::env::var_os("HOME")
		.map(|home| PathBuf::from(home).join("Applications"))
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn only_an_applications_folder_counts_as_installed() {
		assert!(installed(Path::new("/Applications/ReGrind.app")));
		assert!(!installed(Path::new("/Volumes/ReGrind/ReGrind.app")));
		assert!(!installed(Path::new("/Users/x/Downloads/ReGrind.app")));
		assert!(!installed(Path::new("/Applications/Utilities/ReGrind.app")));
	}

	#[test]
	fn the_per_user_applications_folder_counts_too() {
		let Some(personal) = personal() else {
			return;
		};
		assert!(installed(&personal.join("ReGrind.app")));
	}
}
