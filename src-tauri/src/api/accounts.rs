use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::api::ws::spawn_ws_tasks;
use crate::error::AppError;
use crate::state::{Account, AppState};
use crate::storage::{
	adopt_legacy_account, forget_account, AccountIndex, AccountRecord,
	AccountsStorage, AuthStorage, DeviceStorage, ProfileId, SigningKeyStorage,
};

/// One account as the switcher draws it.
///
/// `name` and `avatar` come from the account's own profile and are only known
/// once it has been active; `email` is `None` for a third-party sign-in, whose
/// login field holds an opaque vendor id rather than an address.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
	pub profile_id: ProfileId,
	pub name: Option<String>,
	pub email: Option<String>,
	pub avatar: Option<String>,
	pub google: bool,
	pub added_at: u64,
	pub active: bool,
}

/// Starts the tasks that keep one account's secrets on disk and carry its
/// events to the frontend, and files it in the registry.
///
/// The tasks capture their own profile id, so each account persists to its own
/// keys no matter which one is active.
fn attach(
	app: &AppHandle,
	profile_id: ProfileId,
	client: grindr::GrindrClient,
) {
	let mut account = Account::new(profile_id, client.clone());

	{
		let mut session_rx = client.session_receiver();
		account.own_task(tauri::async_runtime::spawn(async move {
			while session_rx.changed().await.is_ok() {
				match session_rx.borrow().as_ref() {
					Some(s) => {
						if let Err(e) = AuthStorage::set_credentials(
							profile_id,
							&s.credentials,
						) {
							tracing::error!("[session] persist failed: {e}");
						}
					}
					None => AuthStorage::delete_session(profile_id),
				}
			}
		}));
	}

	{
		let client = client.clone();
		let mut key_rx = client.signing_key_receiver();
		account.own_task(tauri::async_runtime::spawn(async move {
			SigningKeyStorage::restore(profile_id, &client).await;
			while key_rx.changed().await.is_ok() {
				match key_rx.borrow().clone() {
					Some(k) => {
						if let Err(e) = SigningKeyStorage::save(profile_id, &k)
						{
							tracing::error!("[signing] persist failed: {e}");
						}
					}
					None => SigningKeyStorage::delete(profile_id),
				}
			}
		}));
	}

	for task in spawn_ws_tasks(app, profile_id, &client) {
		account.own_task(task);
	}

	app.state::<AppState>().insert(account);
}

/// Brings every signed-in account up at launch and points the app at one.
///
/// All of them get a client, because switching has to be immediate and a client
/// costs nothing while idle; only the active one is left active, so only it
/// holds a websocket or looks online.
pub fn restore_on_launch(app: &AppHandle) {
	if let Err(e) = adopt_legacy_account() {
		tracing::error!("[setup] could not adopt the existing account: {e}");
	}

	let index = match AccountsStorage::load() {
		Ok(index) => index,
		Err(e) => {
			tracing::error!("[setup] could not load accounts: {e}");
			AccountIndex::default()
		}
	};

	for record in &index.accounts {
		let profile_id = record.profile_id;
		let session = match AuthStorage::get_session(profile_id) {
			Ok(session) => session,
			Err(e) => {
				tracing::warn!(
					"[setup] could not load session for {profile_id}: {e}"
				);
				None
			}
		};
		// No session means nothing can be done with the account: it cannot be
		// used and it cannot be refreshed, so drop it rather than list an
		// account that would fail the moment it was switched to.
		let Some(session) = session else {
			tracing::warn!("[setup] {profile_id} has no session, dropping it");
			forget_account(profile_id);
			if let Err(e) = AccountsStorage::remove(profile_id) {
				tracing::error!("[setup] could not drop {profile_id}: {e}");
			}
			continue;
		};
		let device = DeviceStorage::load_or_create(profile_id);
		match grindr::GrindrClient::new(device, Some(session)) {
			Ok(client) => attach(app, profile_id, client),
			Err(e) => tracing::error!(
				"[setup] could not build a client for {profile_id}: {e}"
			),
		}
	}

	let state = app.state::<AppState>();
	let active = AccountsStorage::load()
		.map(|index| index.resolved_active())
		.unwrap_or(None)
		.filter(|id| state.client_for(*id).is_some());

	match active {
		Some(profile_id) => {
			state.set_active(Some(profile_id));
			if let Err(e) = AccountsStorage::set_active(Some(profile_id)) {
				tracing::warn!(
					"[setup] could not record the active account: {e}"
				);
			}
		}
		// Nothing signed in: the app opens on sign-in, which needs a client with
		// a fresh device to talk to.
		None => begin_pending(&state),
	}
}

/// Puts a client with a fresh device and no session in front, for a sign-in.
fn begin_pending(state: &AppState) {
	match grindr::GrindrClient::new(grindr::DeviceInfo::generate(), None) {
		Ok(client) => state.set_pending(Some(client)),
		Err(e) => {
			tracing::error!("[setup] could not build a sign-in client: {e}")
		}
	}
}

/// Files a completed sign-in against the account it turned out to belong to.
///
/// Called by every sign-in path. Until it runs, the client that just signed in
/// is the pending one and nothing is persisted, so a sign-in that fails leaves
/// no trace.
pub async fn commit_signed_in(
	app: &AppHandle,
	profile_id_text: &str,
) -> Result<(), AppError> {
	let profile_id: ProfileId = profile_id_text.parse().map_err(|_| {
		AppError::Auth(format!("unusable profile id {profile_id_text:?}"))
	})?;
	let state = app.state::<AppState>();

	let Some(client) = state.take_pending() else {
		// The active account re-authenticated in place; its own watcher has
		// already persisted the new session.
		return Ok(());
	};

	let session = client.session_receiver().borrow().clone();
	let credentials = session.as_ref().map(|s| &s.credentials);
	let label = credentials
		.map(|c| c.email.clone())
		.unwrap_or_else(|| profile_id.to_string());
	let google = credentials
		.is_some_and(|c| matches!(c.kind, grindr::SessionKind::Google));

	if let Some(credentials) = credentials {
		AuthStorage::set_credentials(profile_id, credentials)?;
	}
	DeviceStorage::save(profile_id, &client.current_device().await)?;
	// The name and the face are not known yet: they come from the account's own
	// profile, which the frontend loads once this account is the active one.
	AccountsStorage::upsert(AccountRecord {
		profile_id,
		label,
		name: None,
		avatar: None,
		google,
		added_at: crate::storage::now_unix(),
	})?;

	// Signing into an account that is already signed in replaces it, so the
	// stale client and its tasks have to go.
	drop(state.take(profile_id));
	attach(app, profile_id, client);
	state.set_active(Some(profile_id));
	app.emit("accounts:changed", ()).ok();
	Ok(())
}

#[tauri::command]
pub async fn accounts_list(
	state: tauri::State<'_, AppState>,
) -> Result<Vec<AccountSummary>, AppError> {
	let index = AccountsStorage::load()?;
	let active = state.active_profile_id();
	let mut accounts: Vec<_> = index
		.accounts
		.iter()
		.map(|record| AccountSummary {
			profile_id: record.profile_id,
			name: record.name.clone(),
			email: record.email().map(str::to_owned),
			avatar: record.avatar.clone(),
			google: record.google,
			added_at: record.added_at,
			active: Some(record.profile_id) == active,
		})
		.collect();
	// The account in use first, then oldest to newest: the one you are using is
	// what the sheet is about, and a stable order after it keeps rows from moving
	// around under your thumb as you switch.
	accounts.sort_by_key(|a| (!a.active, a.added_at));
	Ok(accounts)
}

/// Records what the active account's own profile says about it, so the switcher
/// can show a name and a face rather than a login id.
///
/// Only ever called for the account in use: its profile is loaded as part of
/// using it, and asking on a background account's behalf is the traffic that
/// would stop it looking offline.
#[tauri::command]
pub async fn account_set_profile(
	app: AppHandle,
	state: tauri::State<'_, AppState>,
	profile_id: ProfileId,
	name: Option<String>,
	avatar: Option<String>,
) -> Result<(), AppError> {
	if state.active_profile_id() != Some(profile_id) {
		return Ok(());
	}
	AccountsStorage::set_profile(profile_id, name, avatar)?;
	app.emit("accounts:changed", ()).ok();
	Ok(())
}

/// Switches to a signed-in account. The account left behind goes idle, which
/// drops its websocket and stops it looking online.
#[tauri::command]
pub async fn account_switch(
	app: AppHandle,
	state: tauri::State<'_, AppState>,
	profile_id: ProfileId,
) -> Result<(), AppError> {
	if state.client_for(profile_id).is_none() {
		return Err(AppError::Auth(format!("{profile_id} is not signed in")));
	}
	// A switch abandons any sign-in in flight.
	drop(state.take_pending());
	state.set_active(Some(profile_id));
	AccountsStorage::set_active(Some(profile_id))?;

	// The cache is keyed per account, so nothing here is thrown away for
	// correctness; the new account simply starts from its own entries.
	if let Some(client) = state.client_for(profile_id) {
		client.reset_transport().await?;
		client.connect().await;
	}
	app.emit("accounts:changed", ()).ok();
	Ok(())
}

/// Opens a sign-in for an additional account, without disturbing the accounts
/// already signed in. The new account gets its own device identity, so the two
/// cannot be correlated by fingerprint.
#[tauri::command]
pub async fn account_add_begin(
	state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
	begin_pending(&state);
	Ok(())
}

/// Abandons a sign-in that was started with [`account_add_begin`] and returns to
/// whichever account was in use.
#[tauri::command]
pub async fn account_add_cancel(
	state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
	drop(state.take_pending());
	let restored = AccountsStorage::load()?
		.resolved_active()
		.filter(|id| state.client_for(*id).is_some());
	state.set_active(restored);
	if restored.is_none() {
		begin_pending(&state);
	}
	Ok(())
}

/// Whether a sign-in for an additional account is in flight, so the sign-in
/// screen can offer to go back instead of stranding the user.
#[tauri::command]
pub async fn account_add_in_progress(
	state: tauri::State<'_, AppState>,
) -> Result<bool, AppError> {
	Ok(state.pending().is_some() && !state.signed_in_ids().is_empty())
}

/// Signs one account out and forgets everything it owned, leaving the other
/// accounts alone. Answers with the account that is active afterwards, or
/// `null` when that was the last one.
#[tauri::command]
pub async fn account_remove(
	app: AppHandle,
	state: tauri::State<'_, AppState>,
	profile_id: ProfileId,
) -> Result<Option<ProfileId>, AppError> {
	if let Some(account) = state.take(profile_id) {
		account.client.logout().await;
	}
	forget_account(profile_id);
	let index = AccountsStorage::remove(profile_id)?;

	let next = index
		.resolved_active()
		.filter(|id| state.client_for(*id).is_some());
	state.set_active(next);
	AccountsStorage::set_active(next)?;
	match next {
		Some(next) => {
			if let Some(client) = state.client_for(next) {
				client.connect().await;
			}
		}
		None => begin_pending(&state),
	}
	app.emit("accounts:changed", ()).ok();
	Ok(next)
}
