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

#[cfg(test)]
mod tests {
	use super::*;

	fn client() -> grindr::GrindrClient {
		grindr::GrindrClient::new(grindr::DeviceInfo::generate(), None)
			.expect("client")
	}

	fn state_with(ids: &[ProfileId]) -> AppState {
		let state = AppState::default();
		for id in ids {
			state.insert(Account::new(*id, client()));
		}
		state
	}

	#[test]
	fn nothing_is_signed_in_to_begin_with() {
		let state = AppState::default();

		assert!(state.client().is_err());
		assert_eq!(state.active_id(), None);
		assert_eq!(state.active_profile_id(), None);
	}

	#[test]
	fn only_the_active_account_is_left_active() {
		let state = state_with(&[1, 2, 3]);

		state.set_active(Some(2));

		assert_eq!(state.active_id(), Some(2));
		assert!(state.client_for(2).unwrap().is_active());
		for idle in [1, 3] {
			assert!(
				!state.client_for(idle).unwrap().is_active(),
				"{idle} should be idle, which is what drops its websocket"
			);
		}
	}

	#[test]
	fn switching_hands_the_only_active_flag_over() {
		let state = state_with(&[1, 2]);
		state.set_active(Some(1));

		state.set_active(Some(2));

		assert!(!state.client_for(1).unwrap().is_active());
		assert!(state.client_for(2).unwrap().is_active());
	}

	#[test]
	fn a_sign_in_in_flight_answers_for_the_client_and_idles_the_rest() {
		let state = state_with(&[1]);
		state.set_active(Some(1));

		state.set_pending(Some(client()));

		// Nothing signed in as far as anything account-scoped is concerned, so
		// caches keyed by account cannot be shared with the account behind it.
		assert_eq!(state.active_profile_id(), None);
		assert!(state.client().is_ok());
		assert!(
			!state.client_for(1).unwrap().is_active(),
			"the account behind the sign-in must not keep its socket"
		);
	}

	#[test]
	fn abandoning_a_sign_in_gives_the_account_back() {
		let state = state_with(&[1]);
		state.set_active(Some(1));
		state.set_pending(Some(client()));

		assert!(state.take_pending().is_some());
		state.set_active(Some(1));

		assert_eq!(state.active_profile_id(), Some(1));
		assert!(state.client_for(1).unwrap().is_active());
		assert!(state.take_pending().is_none());
	}

	#[test]
	fn removing_the_active_account_leaves_nothing_active() {
		let state = state_with(&[1, 2]);
		state.set_active(Some(1));

		assert!(state.take(1).is_some());

		assert_eq!(state.active_id(), None);
		assert!(state.client_for(1).is_none());
		assert!(state.client_for(2).is_some());
		assert!(state.client().is_err());
	}

	#[test]
	fn removing_a_background_account_leaves_the_active_one_alone() {
		let state = state_with(&[1, 2]);
		state.set_active(Some(1));

		assert!(state.take(2).is_some());

		assert_eq!(state.active_id(), Some(1));
		assert!(state.client_for(1).unwrap().is_active());
	}

	#[test]
	fn signing_into_an_account_twice_replaces_the_client_it_had() {
		let state = state_with(&[1]);
		let replacement = client();

		state.insert(Account::new(1, replacement));
		state.set_active(Some(1));

		assert_eq!(state.signed_in_ids(), vec![1]);
		assert!(state.client_for(1).unwrap().is_active());
	}

	#[test]
	fn a_task_for_an_account_that_is_gone_is_dropped_rather_than_left_running()
	{
		let runtime = tokio::runtime::Builder::new_current_thread()
			.enable_time()
			.build()
			.unwrap();
		let _guard = runtime.enter();
		let state = AppState::default();

		let task = tauri::async_runtime::spawn(async {
			// Long enough that it can only end by being aborted.
			tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
		});
		state.own_task(7, task);

		// Nothing to assert beyond not leaking: with no account 7 the handle has
		// no owner, so `own_task` aborts it instead of dropping it on the floor.
		assert!(state.client_for(7).is_none());
	}
}
