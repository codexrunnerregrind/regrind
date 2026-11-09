//! Grindr refuses app versions it has retired. The fork publishes the version
//! to emulate in its repo, so a Grindr update needs no new ReGrind release.

use std::path::{Path, PathBuf};
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};

const VERSION_URL: &str =
	"https://raw.githubusercontent.com/codexrunnerregrind/regrind/main/grindr-version.json";
const CACHE_FILE: &str = "grindr-version";

#[derive(serde::Deserialize)]
struct Published {
	version: String,
}

fn parse(version: &str) -> Option<Vec<u64>> {
	let parts: Vec<u64> = version
		.split('.')
		.map(str::parse)
		.collect::<Result<_, _>>()
		.ok()?;
	(parts.len() == 4).then_some(parts)
}

/// Only a version newer than the one in effect is taken, so a stale cache
/// never undoes a newer build.
fn newer_than_current(version: &str) -> bool {
	match (parse(version), parse(&grindr::app_version())) {
		(Some(candidate), Some(current)) => candidate > current,
		_ => false,
	}
}

fn cache_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	app.path()
		.app_local_data_dir()
		.ok()
		.map(|dir| dir.join(CACHE_FILE))
}

fn apply(version: &str) -> bool {
	if !newer_than_current(version) {
		return false;
	}
	tracing::info!("[grindr-version] emulating {version}");
	grindr::set_app_version(Some(version.to_owned()));
	true
}

fn apply_cached(path: &Path) {
	if let Ok(version) = std::fs::read_to_string(path) {
		apply(version.trim());
	}
}

async fn fetch() -> Result<String, String> {
	let client = wreq::Client::builder()
		.https_only(true)
		.connect_timeout(Duration::from_secs(10))
		.read_timeout(Duration::from_secs(15))
		.build()
		.map_err(|e| e.to_string())?;
	let response = client
		.get(VERSION_URL)
		.header("user-agent", "regrind")
		.send()
		.await
		.map_err(|e| e.to_string())?;
	if !response.status().is_success() {
		return Err(format!("HTTP {}", response.status()));
	}
	let body = response.bytes().await.map_err(|e| e.to_string())?;
	let published: Published =
		serde_json::from_slice(&body).map_err(|e| e.to_string())?;
	Ok(published.version)
}

/// Fetches the published version; true when it replaced the one in effect.
pub async fn refresh<R: Runtime>(app: &AppHandle<R>) -> bool {
	let version = match fetch().await {
		Ok(version) => version,
		Err(e) => {
			tracing::warn!("[grindr-version] fetch failed: {e}");
			return false;
		}
	};
	if !apply(&version) {
		return false;
	}
	if let Some(path) = cache_path(app) {
		if let Some(dir) = path.parent() {
			let _ = std::fs::create_dir_all(dir);
		}
		if let Err(e) = std::fs::write(&path, &version) {
			tracing::warn!("[grindr-version] could not cache {version}: {e}");
		}
	}
	true
}

pub fn init<R: Runtime>(app: &AppHandle<R>) {
	if let Some(path) = cache_path(app) {
		apply_cached(&path);
	}
	let app = app.clone();
	tauri::async_runtime::spawn(async move {
		refresh(&app).await;
	});
}

#[tauri::command]
pub async fn refresh_grindr_version<R: Runtime>(app: AppHandle<R>) -> bool {
	refresh(&app).await
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn only_a_four_part_numeric_version_parses() {
		assert_eq!(parse("26.24.0.195444"), Some(vec![26, 24, 0, 195444]));
		assert_eq!(parse("26.24.0"), None);
		assert_eq!(parse("26.x.0.1"), None);
	}

	#[test]
	fn an_older_or_equal_version_is_ignored() {
		assert!(!newer_than_current(grindr::APP_VERSION));
		assert!(!newer_than_current("1.0.0.1"));
		assert!(newer_than_current("999.0.0.1"));
	}
}
