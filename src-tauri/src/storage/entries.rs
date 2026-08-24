use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::error::AppError;

/// A Grindr profile id, which is what every account's secrets are keyed by.
pub type ProfileId = u64;

const DEVICE: &str = "device-info";
const SESSION: &str = "session";
const SIGNING_KEY: &str = "device-signing-key";
const ACCOUNTS: &str = "accounts";

/// Where one account's secret lives. Secrets were stored under a bare name
/// while only one account could be signed in; each is now suffixed with the
/// profile it belongs to, so several accounts can sit side by side without
/// overwriting each other.
fn keyed(base: &str, profile_id: ProfileId) -> String {
	format!("{base}:{profile_id}")
}

fn entry(key: &str) -> Result<keyring_core::Entry, AppError> {
	keyring_core::Entry::new("open-grind", key)
		.map_err(|e| AppError::Auth(e.to_string()))
}

/// Reads a msgpack secret. `Ok(None)` means there is nothing stored; a stored
/// secret that will not decode is an error, which each caller answers for
/// itself — some replace it, some discard it.
fn read<T: DeserializeOwned>(key: &str) -> Result<Option<T>, AppError> {
	let bytes = match entry(key)?.get_secret() {
		Ok(b) => b,
		Err(keyring_core::Error::NoEntry) => return Ok(None),
		Err(e) => return Err(AppError::Auth(e.to_string())),
	};
	rmp_serde::from_slice::<T>(&bytes)
		.map(Some)
		.map_err(|e| AppError::Auth(format!("{key} decode failed: {e}")))
}

fn write<T: Serialize>(key: &str, value: &T) -> Result<(), AppError> {
	let bytes = rmp_serde::encode::to_vec_named(value)
		.map_err(|e| AppError::Auth(format!("{key} encode failed: {e}")))?;
	entry(key)?
		.set_secret(&bytes)
		.map_err(|e| AppError::Auth(e.to_string()))
}

fn erase(key: &str) {
	match entry(key) {
		Ok(entry) => match entry.delete_credential() {
			Ok(()) | Err(keyring_core::Error::NoEntry) => {}
			Err(e) => {
				tracing::warn!("[storage] failed to delete {key}: {e}")
			}
		},
		Err(e) => {
			tracing::warn!("[storage] failed to open {key} for deletion: {e}")
		}
	}
}

/// One signed-in account, as the switcher sees it.
///
/// The label is copied out of the session at sign-in rather than read back from
/// it: listing accounts must not have to open every account's session, both
/// because the iOS store guards secrets and because the list is drawn far more
/// often than it changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountRecord {
	pub profile_id: ProfileId,
	pub label: String,
	pub added_at: u64,
}

/// Every account the app has a session for, and which one is in use.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountIndex {
	#[serde(default)]
	pub accounts: Vec<AccountRecord>,
	#[serde(default)]
	pub active: Option<ProfileId>,
}

impl AccountIndex {
	pub fn contains(&self, profile_id: ProfileId) -> bool {
		self.accounts.iter().any(|a| a.profile_id == profile_id)
	}

	/// The account that should be active: the stored one when it still exists,
	/// otherwise whichever account has been signed in longest, so a removed
	/// active account always leaves a usable successor behind.
	pub fn resolved_active(&self) -> Option<ProfileId> {
		self.active
			.filter(|id| self.contains(*id))
			.or_else(|| self.accounts.first().map(|a| a.profile_id))
	}
}

pub struct AccountsStorage;

impl AccountsStorage {
	pub fn load() -> Result<AccountIndex, AppError> {
		match read::<AccountIndex>(ACCOUNTS) {
			Ok(Some(index)) => Ok(index),
			Ok(None) => Ok(AccountIndex::default()),
			// An unreadable index would otherwise strand every account's
			// secrets: the sessions are still there but nothing lists them.
			// Start over, and the accounts can be signed into again.
			Err(e) => {
				tracing::warn!("[storage] account index unreadable: {e}");
				erase(ACCOUNTS);
				Ok(AccountIndex::default())
			}
		}
	}

	pub fn save(index: &AccountIndex) -> Result<(), AppError> {
		write(ACCOUNTS, index)
	}

	/// Adds an account, or refreshes the label of one already listed, and makes
	/// it the active one. Signing into an account twice must not list it twice.
	pub fn upsert(record: AccountRecord) -> Result<AccountIndex, AppError> {
		let mut index = Self::load()?;
		match index
			.accounts
			.iter_mut()
			.find(|a| a.profile_id == record.profile_id)
		{
			Some(existing) => existing.label = record.label,
			None => index.accounts.push(record.clone()),
		}
		index.active = Some(record.profile_id);
		Self::save(&index)?;
		Ok(index)
	}

	pub fn remove(profile_id: ProfileId) -> Result<AccountIndex, AppError> {
		let mut index = Self::load()?;
		index.accounts.retain(|a| a.profile_id != profile_id);
		if index.active == Some(profile_id) {
			index.active = index.accounts.first().map(|a| a.profile_id);
		}
		Self::save(&index)?;
		Ok(index)
	}

	pub fn set_active(profile_id: Option<ProfileId>) -> Result<(), AppError> {
		let mut index = Self::load()?;
		index.active = profile_id;
		Self::save(&index)
	}
}

pub struct DeviceStorage;

impl DeviceStorage {
	pub fn load(
		profile_id: ProfileId,
	) -> Result<Option<grindr::DeviceInfo>, AppError> {
		read(&keyed(DEVICE, profile_id))
	}

	pub fn save(
		profile_id: ProfileId,
		device: &grindr::DeviceInfo,
	) -> Result<(), AppError> {
		write(&keyed(DEVICE, profile_id), device)
	}

	/// The account's device, or a fresh one when it has none or the stored one
	/// is unreadable. Every account carries its own device identity: sharing one
	/// fingerprint across accounts ties them together, and rotating a shared one
	/// on sign-out would pull the rug from under the accounts left behind.
	pub fn load_or_create(profile_id: ProfileId) -> grindr::DeviceInfo {
		match Self::load(profile_id) {
			Ok(Some(device)) => return device,
			Ok(None) => {}
			Err(e) => tracing::warn!(
				"[setup] could not load device info for {profile_id}, \
				 replacing it: {e}"
			),
		}
		let device = grindr::DeviceInfo::generate();
		if let Err(e) = Self::save(profile_id, &device) {
			tracing::error!("[setup] could not persist device info: {e}");
		}
		device
	}

	pub fn delete(profile_id: ProfileId) {
		erase(&keyed(DEVICE, profile_id));
	}
}

pub struct AuthStorage;

impl AuthStorage {
	pub fn get_session(
		profile_id: ProfileId,
	) -> Result<Option<grindr::Session>, AppError> {
		let key = keyed(SESSION, profile_id);
		match read::<grindr::Session>(&key) {
			Ok(session) => Ok(session),
			// A session we cannot read is a session we cannot use, and keeping
			// it only means failing the same way on every launch.
			Err(_) => {
				erase(&key);
				Ok(None)
			}
		}
	}

	pub fn set_session(
		profile_id: ProfileId,
		session: &grindr::Session,
	) -> Result<(), AppError> {
		write(&keyed(SESSION, profile_id), session)
	}

	pub fn delete_session(profile_id: ProfileId) {
		erase(&keyed(SESSION, profile_id));
	}
}

pub struct SigningKeyStorage;

impl SigningKeyStorage {
	pub fn load(
		profile_id: ProfileId,
	) -> Result<Option<grindr::DeviceSigningKey>, AppError> {
		Ok(read(&keyed(SIGNING_KEY, profile_id)).unwrap_or(None))
	}

	pub fn save(
		profile_id: ProfileId,
		key: &grindr::DeviceSigningKey,
	) -> Result<(), AppError> {
		write(&keyed(SIGNING_KEY, profile_id), key)
	}

	pub fn delete(profile_id: ProfileId) {
		erase(&keyed(SIGNING_KEY, profile_id));
	}

	pub async fn restore(profile_id: ProfileId, client: &grindr::GrindrClient) {
		let Some(key) = Self::load(profile_id).unwrap_or(None) else {
			return;
		};
		if client.restore_signing_key(key).await {
			return;
		}
		tracing::warn!("[signing] stored key was refused, deleting it");
		Self::delete(profile_id);
	}
}

/// Everything one account owns, dropped together.
pub fn forget_account(profile_id: ProfileId) {
	AuthStorage::delete_session(profile_id);
	SigningKeyStorage::delete(profile_id);
	DeviceStorage::delete(profile_id);
}

/// Moves a single-account install onto the per-account keys.
///
/// Runs once, before anything reads the index. The session is what names the
/// account — the device and signing key are anonymous on their own — so a
/// legacy install without a readable session has nothing worth adopting and its
/// leftovers are dropped instead: the device belonged to a sign-in that never
/// completed, and the next one generates its own.
pub fn adopt_legacy_account() -> Result<(), AppError> {
	let index = AccountsStorage::load()?;
	if !index.accounts.is_empty() {
		return Ok(());
	}

	let legacy = read::<grindr::Session>(SESSION).unwrap_or(None);
	let Some(profile_id) = legacy
		.as_ref()
		.and_then(|s| s.profile_id.parse::<ProfileId>().ok())
	else {
		for key in [SESSION, DEVICE, SIGNING_KEY] {
			erase(key);
		}
		return Ok(());
	};
	let session = legacy.expect("parsed a profile id out of it");

	AuthStorage::set_session(profile_id, &session)?;
	if let Ok(Some(device)) = read::<grindr::DeviceInfo>(DEVICE) {
		DeviceStorage::save(profile_id, &device)?;
	}
	if let Ok(Some(key)) = read::<grindr::DeviceSigningKey>(SIGNING_KEY) {
		SigningKeyStorage::save(profile_id, &key)?;
	}
	for key in [SESSION, DEVICE, SIGNING_KEY] {
		erase(key);
	}

	AccountsStorage::save(&AccountIndex {
		accounts: vec![AccountRecord {
			profile_id,
			label: session.email.clone(),
			added_at: now_unix(),
		}],
		active: Some(profile_id),
	})?;
	tracing::info!("[storage] adopted the existing account as {profile_id}");
	Ok(())
}

pub fn now_unix() -> u64 {
	std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map(|d| d.as_secs())
		.unwrap_or(0)
}
