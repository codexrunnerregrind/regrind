use std::collections::HashMap;
use std::sync::RwLock;

use tauri::async_runtime::JoinHandle;

use crate::error::AppError;
use crate::storage::ProfileId;

/// A signed-in account and the background tasks that persist it.
///
/// Every account keeps a live client for as long as it is signed in, but only
/// the active one is [`set_active`](grindr::GrindrClient::set_active): idle, the
/// client drops its websocket and stops reconnecting, which is what takes a
/// background account offline. Presence is inferred from request activity, so
/// an account nothing is asking for lapses on its own.
pub struct Account {
	pub profile_id: ProfileId,
	pub client: grindr::GrindrClient,
	tasks: Vec<JoinHandle<()>>,
}

impl Account {
	pub fn new(profile_id: ProfileId, client: grindr::GrindrClient) -> Self {
		Self {
			profile_id,
			client,
			tasks: Vec::new(),
		}
	}

	pub fn own_task(&mut self, task: JoinHandle<()>) {
		self.tasks.push(task);
	}

	/// Stops everything watching this account. Called before it stops being
	/// active, so exactly one account is ever forwarding websocket events to
	/// the frontend.
	pub fn abort_tasks(&mut self) {
		for task in self.tasks.drain(..) {
			task.abort();
		}
	}
}

#[derive(Default)]
pub struct AppState {
	accounts: RwLock<HashMap<ProfileId, Account>>,
	active: RwLock<Option<ProfileId>>,
	/// A client with a fresh device and no session, held while a sign-in is in
	/// flight. Until the sign-in lands there is no profile id to key an account
	/// by, and the account being added must not disturb the one signed in.
	pending: RwLock<Option<grindr::GrindrClient>>,
}

impl AppState {
	/// The client every command speaks through: the sign-in in flight if there
	/// is one, otherwise the active account's.
	///
	/// Returns a clone rather than a borrow — the accounts sit behind a lock,
	/// and holding it across the awaits in the commands would be a deadlock
	/// waiting to happen. `GrindrClient` is a handle, so cloning is cheap and
	/// every clone drives the same session.
	pub fn client(&self) -> Result<grindr::GrindrClient, AppError> {
		if let Some(pending) = self.pending.read().ok().and_then(|p| p.clone())
		{
			return Ok(pending);
		}
		let active = self.active_id().ok_or(AppError::NotInitialized)?;
		self.accounts
			.read()
			.map_err(|_| AppError::NotInitialized)?
			.get(&active)
			.map(|account| account.client.clone())
			.ok_or(AppError::NotInitialized)
	}

	pub fn active_id(&self) -> Option<ProfileId> {
		*self.active.read().ok()?
	}

	/// The profile the active client is really signed in as, which is `None`
	/// while a sign-in is in flight. Used to scope caches that must not be
	/// shared between accounts.
	pub fn active_profile_id(&self) -> Option<ProfileId> {
		if self.pending.read().ok()?.is_some() {
			return None;
		}
		self.active_id()
	}

	pub fn client_for(
		&self,
		profile_id: ProfileId,
	) -> Option<grindr::GrindrClient> {
		Some(self.accounts.read().ok()?.get(&profile_id)?.client.clone())
	}

	pub fn signed_in_ids(&self) -> Vec<ProfileId> {
		self.accounts
			.read()
			.map(|accounts| accounts.keys().copied().collect())
			.unwrap_or_default()
	}

	pub fn insert(&self, account: Account) {
		if let Ok(mut accounts) = self.accounts.write() {
			if let Some(mut previous) =
				accounts.insert(account.profile_id, account)
			{
				previous.abort_tasks();
			}
		}
	}

	/// Removes an account, stopping its tasks and clearing the active pointer if
	/// it was the one in use. The caller decides who becomes active next.
	pub fn take(&self, profile_id: ProfileId) -> Option<Account> {
		let mut account = self.accounts.write().ok()?.remove(&profile_id)?;
		account.abort_tasks();
		if self.active_id() == Some(profile_id) {
			self.set_active(None);
		}
		Some(account)
	}

	/// Points the app at one account and idles all the others.
	pub fn set_active(&self, profile_id: Option<ProfileId>) {
		if let Ok(accounts) = self.accounts.read() {
			for (id, account) in accounts.iter() {
				account.client.set_active(Some(*id) == profile_id);
			}
		}
		if let Ok(mut active) = self.active.write() {
			*active = profile_id;
		}
	}

	pub fn abort_tasks_for(&self, profile_id: ProfileId) {
		if let Ok(mut accounts) = self.accounts.write() {
			if let Some(account) = accounts.get_mut(&profile_id) {
				account.abort_tasks();
			}
		}
	}

	pub fn own_task(&self, profile_id: ProfileId, task: JoinHandle<()>) {
		let mut accounts = match self.accounts.write() {
			Ok(accounts) => accounts,
			Err(_) => return,
		};
		match accounts.get_mut(&profile_id) {
			Some(account) => account.own_task(task),
			// The account went away while its task was being spawned; the task
			// would be watching a client nothing else holds.
			None => task.abort(),
		}
	}

	pub fn set_pending(&self, client: Option<grindr::GrindrClient>) {
		// A sign-in in flight must not leave the account behind it connected:
		// its websocket would keep delivering events into a UI that is showing
		// the sign-in form.
		if let Ok(accounts) = self.accounts.read() {
			let idle = client.is_some();
			for account in accounts.values() {
				if idle {
					account.client.set_active(false);
				}
			}
		}
		if let Ok(mut pending) = self.pending.write() {
			*pending = client;
		}
	}

	pub fn pending(&self) -> Option<grindr::GrindrClient> {
		self.pending.read().ok().and_then(|p| p.clone())
	}

	pub fn take_pending(&self) -> Option<grindr::GrindrClient> {
		self.pending.write().ok()?.take()
	}
}
