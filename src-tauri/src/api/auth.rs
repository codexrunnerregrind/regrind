use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};

use crate::api::accounts::commit_signed_in;
use crate::error::AppError;
use crate::media::MediaProxy;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInResult {
	pub profile_id: String,
	pub restriction: Option<Restriction>,
}

impl From<grindr::SignInResult> for SignInResult {
	fn from(r: grindr::SignInResult) -> Self {
		Self {
			profile_id: r.profile_id,
			restriction: r.restriction.map(Restriction::from),
		}
	}
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Restriction {
	pub kind: String,
	pub region: Option<String>,
	pub reason: Option<String>,
}

impl From<grindr::Restriction> for Restriction {
	fn from(r: grindr::Restriction) -> Self {
		match r {
			grindr::Restriction::AgeVerification { region, reason } => Self {
				kind: "ageVerification".to_owned(),
				region: Some(region_str(region).to_owned()),
				reason: Some(reason),
			},
			grindr::Restriction::TimedBan(details) => Self {
				kind: "timedBan".to_owned(),
				region: None,
				reason: details.reason,
			},
			grindr::Restriction::TrustVendorRejected => Self {
				kind: "trustVendorRejected".to_owned(),
				region: None,
				reason: None,
			},
			grindr::Restriction::Other(raw) => Self {
				kind: "other".to_owned(),
				region: None,
				reason: Some(raw),
			},
			_ => Self {
				kind: "other".to_owned(),
				region: None,
				reason: None,
			},
		}
	}
}

fn region_str(region: grindr::VerificationRegion) -> &'static str {
	match region {
		grindr::VerificationRegion::Uk => "uk",
		grindr::VerificationRegion::Br => "br",
		grindr::VerificationRegion::Au => "au",
		_ => "other",
	}
}

#[tauri::command]
pub async fn sign_in_with_email(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	email: String,
	password: String,
	captcha_token: Option<String>,
) -> Result<SignInResult, AppError> {
	let client = state.client()?;
	let result = match captcha_token {
		Some(token) => {
			client
				.sign_in_with_email_captcha(&email, &password, &token)
				.await?
		}
		None => client.sign_in_with_email(&email, &password).await?,
	};
	commit_signed_in(&app, &result.profile_id).await?;
	Ok(SignInResult::from(result))
}

#[tauri::command]
pub async fn sign_in_with_google(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
) -> Result<SignInResult, AppError> {
	let access_token =
		super::google_oauth::fetch_google_access_token(&app).await?;
	let result = state.client()?.sign_in_with_google(&access_token).await?;
	commit_signed_in(&app, &result.profile_id).await?;
	Ok(SignInResult::from(result))
}

#[tauri::command]
pub async fn sign_in_with_google_token(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	token: String,
) -> Result<SignInResult, AppError> {
	let result = state.client()?.sign_in_with_google(&token).await?;
	commit_signed_in(&app, &result.profile_id).await?;
	Ok(SignInResult::from(result))
}

/// Refreshes the session. An optional `geohash` tags the refresh so the server
/// records that approximate location for the resumed session; the app uses it
/// to seed a location whose region grants the expiring-media and unsend
/// entitlements, which then stick for the rest of the session.
#[tauri::command]
pub fn backend_ready(state: tauri::State<'_, AppState>) -> bool {
	state.client().is_ok()
}

#[tauri::command]
pub fn google_handoff_pending(app: tauri::AppHandle) -> bool {
	super::google_oauth::handoff_pending(&app)
}

#[tauri::command]
pub async fn sign_in_with_google_handoff(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
) -> Result<Option<SignInResult>, AppError> {
	let Some(token) = super::google_oauth::take_handoff(&app) else {
		return Ok(None);
	};
	let result = state.client()?.sign_in_with_google(&token).await?;
	Ok(Some(SignInResult::from(result)))
}

#[tauri::command]
pub fn discard_google_handoff(app: tauri::AppHandle) {
	super::google_oauth::discard_handoff(&app);
}

#[tauri::command]
pub async fn sign_in_with_facebook(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
) -> Result<SignInResult, AppError> {
	let access_token =
		super::facebook_oauth::fetch_facebook_access_token(&app).await?;
	let result = state.client()?.sign_in_with_facebook(&access_token).await?;
	Ok(SignInResult::from(result))
}

#[tauri::command]
pub async fn refresh_session(
	state: tauri::State<'_, AppState>,
	geohash: Option<String>,
) -> Result<SignInResult, AppError> {
	let client = state.client()?;
	let result = client
		.refresh_session_at_geohash(geohash.as_deref())
		.await
		.map_err(|e| AppError::from_client_error(e, &client))?;
	Ok(SignInResult::from(result))
}

/// Signs the account in use out and forgets it, leaving the other signed-in
/// accounts untouched. Answers with the account that is active afterwards, or
/// `null` when that was the last one and the app is back at sign-in.
///
/// The device identity is not rotated the way it once was: each account owns
/// its device, so the one being signed out leaves with it and there is nothing
/// shared left to rotate.
#[tauri::command]
pub async fn sign_out(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	media: tauri::State<'_, MediaProxy>,
) -> Result<Option<u64>, AppError> {
	super::facebook_oauth::forget_sign_in_profile(&app).await;
	let Some(profile_id) = state.active_profile_id() else {
		// Nothing is signed in; a sign-in in flight is simply abandoned.
		super::accounts::account_add_cancel(state).await?;
		return Ok(None);
	};
	media.forget_account(profile_id).await;
	crate::upload::staged::discard_all(&app);
	super::accounts::account_remove(app, state, profile_id).await
}

#[tauri::command]
pub async fn recaptcha_first_party_enabled(
	state: tauri::State<'_, AppState>,
) -> Result<bool, AppError> {
	state
		.client()?
		.recaptcha_first_party_enabled()
		.await
		.map_err(Into::into)
}

#[tauri::command]
pub async fn account_restriction(
	state: tauri::State<'_, AppState>,
) -> Result<Option<Restriction>, AppError> {
	let Ok(client) = state.client() else {
		return Ok(None);
	};
	Ok(client
		.session_receiver()
		.borrow()
		.as_ref()
		.and_then(|s| s.token.as_ref())
		.and_then(|token| token.restriction.clone())
		.map(Restriction::from))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeatureFlagClaims {
	#[serde(default)]
	feature_flags: Vec<String>,
}

fn feature_flags_of(session_id: &str) -> Vec<String> {
	session_id
		.split('.')
		.nth(1)
		.and_then(|payload| URL_SAFE_NO_PAD.decode(payload).ok())
		.and_then(|json| {
			serde_json::from_slice::<FeatureFlagClaims>(&json).ok()
		})
		.map(|claims| claims.feature_flags)
		.unwrap_or_default()
}

#[tauri::command]
pub async fn session_feature_flags(
	state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, AppError> {
	let Ok(client) = state.client() else {
		return Ok(Vec::new());
	};
	Ok(client
		.session_receiver()
		.borrow()
		.as_ref()
		.and_then(|s| s.token.as_ref())
		.map(|token| feature_flags_of(&token.session_id))
		.unwrap_or_default())
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn simulated_age_restriction_maps_to_frontend_shape() {
		let restriction: grindr::Restriction = serde_json::from_str(
			r#"{"AgeVerification":{"region":"Uk","reason":"UK_VERIFICATION_REQUIRED"}}"#,
		)
		.unwrap();

		let mapped = Restriction::from(restriction);
		let json = serde_json::to_value(&mapped).unwrap();
		assert_eq!(json["kind"], "ageVerification");
		assert_eq!(json["region"], "uk");
		assert_eq!(json["reason"], "UK_VERIFICATION_REQUIRED");
	}

	fn jwt_with_payload(payload: serde_json::Value) -> String {
		format!(
			"{}.{}.signature",
			URL_SAFE_NO_PAD.encode(r#"{"alg":"HS256"}"#),
			URL_SAFE_NO_PAD.encode(payload.to_string()),
		)
	}

	#[test]
	fn feature_flags_come_from_the_session_jwt() {
		let token = jwt_with_payload(serde_json::json!({
			"exp": 1,
			"featureFlags": ["edge-boost", "gender-filter"],
		}));
		assert_eq!(feature_flags_of(&token), ["edge-boost", "gender-filter"]);
	}

	#[test]
	fn an_unreadable_session_jwt_has_no_feature_flags() {
		assert!(feature_flags_of("sid").is_empty());
		assert!(feature_flags_of("a.%%%.c").is_empty());
		assert!(feature_flags_of(&jwt_with_payload(
			serde_json::json!({ "exp": 1 })
		))
		.is_empty());
	}
}
