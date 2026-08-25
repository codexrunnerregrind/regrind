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
/// Everything here is copied out of the session at sign-in rather than read back
/// from it: listing accounts must not have to open every account's session, both
/// because the iOS store guards secrets and because the list is drawn far more
/// often than it changes. Reaching out on a background account's behalf is also
/// exactly the traffic that would stop it looking offline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountRecord {
	pub profile_id: ProfileId,
	/// How the account identifies itself to the API: the email for a password
	/// login, an opaque vendor id for a third-party one. Never shown raw — see
	/// [`Self::email`].
	pub label: String,
	/// The account's own profile name, filled in once it is active and its
	/// profile has been loaded. `None` until then, and for an account that has
	/// not been switched to since it was added.
	#[serde(default)]
	pub name: Option<String>,
	/// The media hash of the account's first profile photo, for the switcher's
	/// avatar. Stored rather than fetched per row: the bytes come through the
	/// media proxy on the *active* account's session, so drawing another
	/// account's face costs that account nothing and leaves it offline.
	#[serde(default)]
	pub avatar: Option<String>,
	/// Whether this was a third-party sign-in, in which case `label` is an
	/// opaque id and there is no email to show.
	#[serde(default)]
	pub google: bool,
	pub added_at: u64,
}

impl AccountRecord {
	/// The label only when it really is an email. A third-party sign-in puts a
	/// vendor id in the same field — `Q60CB36Z47` and the like — which says
	/// nothing to the person reading it, least of all in a sign-out row.
	pub fn email(&self) -> Option<&str> {
		(!self.google && self.label.contains('@')).then_some(&*self.label)
	}
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

	/// Adds an account, or refreshes what is known about one already listed, and
	/// makes it the active one. Signing into an account twice must not list it
	/// twice, and must not forget the name already learned for it.
	pub fn upsert(record: AccountRecord) -> Result<AccountIndex, AppError> {
		let mut index = Self::load()?;
		match index
			.accounts
			.iter_mut()
			.find(|a| a.profile_id == record.profile_id)
		{
			Some(existing) => {
				existing.label = record.label;
				existing.google = record.google;
				existing.name = record.name.or_else(|| existing.name.clone());
				existing.avatar =
					record.avatar.or_else(|| existing.avatar.clone());
			}
			None => index.accounts.push(record.clone()),
		}
		index.active = Some(record.profile_id);
		Self::save(&index)?;
		Ok(index)
	}

	/// Records what the account's own profile says about it. Called once that
	/// profile has been loaded, which only happens while it is the active one.
	pub fn set_profile(
		profile_id: ProfileId,
		name: Option<String>,
		avatar: Option<String>,
	) -> Result<(), AppError> {
		let mut index = Self::load()?;
		let Some(account) = index
			.accounts
			.iter_mut()
			.find(|a| a.profile_id == profile_id)
		else {
			return Ok(());
		};
		if account.name == name && account.avatar == avatar {
			return Ok(());
		}
		account.name = name;
		account.avatar = avatar;
		Self::save(&index)
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
	/// Only the durable half of a session is kept. The minted `session_id` dies
	/// within the hour, so storing it buys nothing on the next launch and puts
	/// a live bearer token in the keyring for as long as it lasts. What was
	/// written by an earlier version still reads back: the fields it carried on
	/// top of these are simply ignored.
	pub fn get_credentials(
		profile_id: ProfileId,
	) -> Result<Option<grindr::Credentials>, AppError> {
		let key = keyed(SESSION, profile_id);
		match read::<grindr::Credentials>(&key) {
			Ok(credentials) => Ok(credentials),
			// Credentials we cannot read are credentials we cannot use, and
			// keeping them only means failing the same way on every launch.
			Err(_) => {
				erase(&key);
				Ok(None)
			}
		}
	}

	/// The session the account resumes with: what was stored, and no token
	/// until one is minted.
	pub fn get_session(
		profile_id: ProfileId,
	) -> Result<Option<grindr::Session>, AppError> {
		Ok(Self::get_credentials(profile_id)?.map(|credentials| {
			grindr::Session {
				credentials,
				token: None,
			}
		}))
	}

	pub fn set_credentials(
		profile_id: ProfileId,
		credentials: &grindr::Credentials,
	) -> Result<(), AppError> {
		write(&keyed(SESSION, profile_id), credentials)
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

	let legacy = read::<grindr::Credentials>(SESSION).unwrap_or(None);
	let Some(profile_id) = legacy
		.as_ref()
		.and_then(|c| c.profile_id.as_deref())
		.and_then(|id| id.parse::<ProfileId>().ok())
	else {
		for key in [SESSION, DEVICE, SIGNING_KEY] {
			erase(key);
		}
		return Ok(());
	};
	let credentials = legacy.expect("parsed a profile id out of it");

	AuthStorage::set_credentials(profile_id, &credentials)?;
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
			label: credentials.email.clone(),
			name: None,
			avatar: None,
			google: matches!(credentials.kind, grindr::SessionKind::Google),
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
