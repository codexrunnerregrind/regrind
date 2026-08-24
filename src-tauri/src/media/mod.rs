mod cache;
mod flight;
mod range;
mod response;
mod target;
mod upstream;

use std::collections::HashSet;

use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{
	AppHandle, Manager, Runtime, UriSchemeContext, UriSchemeResponder,
};
use tokio::sync::{Mutex, Semaphore};

use crate::state::AppState;
use crate::storage::ProfileId;

use cache::{cache_key, scope_of, CachedMedia, MediaCache};
use flight::Flights;
use range::deliver_ranged;
use response::{deliverable_status, refused};
use target::{decode_target, Target};
use upstream::{deliver_upstream, fetch, refusal, serve_windowed, FetchError};

pub const SCHEME: &str = "ogmedia";

const MAX_MEDIA_BYTES: usize = 16 * 1024 * 1024;
const OFFICIAL_APP_REQUESTS_PER_HOST: usize = 20;

pub struct MediaProxy {
	cache: Mutex<MediaCache>,
	oversized: Mutex<HashSet<String>>,
	flights: Flights,
	fetches: Semaphore,
}

impl Default for MediaProxy {
	fn default() -> Self {
		Self {
			cache: Mutex::default(),
			oversized: Mutex::default(),
			flights: Flights::default(),
			fetches: Semaphore::new(OFFICIAL_APP_REQUESTS_PER_HOST),
		}
	}
}

impl MediaProxy {
	pub async fn forget_everything(&self) {
		self.cache.lock().await.clear();
		self.oversized.lock().await.clear();
	}

	/// Drops what one account had cached, on its way out. The other accounts
	/// keep theirs: signing one account out is no reason to make the rest
	/// refetch every photo.
	pub async fn forget_account(&self, profile_id: ProfileId) {
		let scope = scope_of(Some(profile_id));
		self.cache.lock().await.clear_scope(&scope);
		self.oversized
			.lock()
			.await
			.retain(|key| !key.starts_with(&scope));
	}
}

pub fn handle<R: Runtime>(
	context: UriSchemeContext<'_, R>,
	request: Request<Vec<u8>>,
	responder: UriSchemeResponder,
) {
	let app = context.app_handle().clone();
	let is_head = request.method() == Method::HEAD;
	let allowed_method = is_head || request.method() == Method::GET;
	let target = decode_target(request.uri().path());
	let range = request
		.headers()
		.get(header::RANGE)
		.and_then(|value| value.to_str().ok())
		.map(str::to_owned);

	tauri::async_runtime::spawn(async move {
		let response = if allowed_method {
			serve(&app, target, range, is_head).await
		} else {
			refused(StatusCode::METHOD_NOT_ALLOWED)
		};
		responder.respond(response);
	});
}

async fn serve<R: Runtime>(
	app: &AppHandle<R>,
	target: Option<Target>,
	range: Option<String>,
	is_head: bool,
) -> Response<Vec<u8>> {
	let Some(Target { url, fetcher }) = target else {
		return refused(StatusCode::BAD_REQUEST);
	};
	let range = range.as_deref();
	// Scoped to the account that is asking. The cache sits in front of the
	// server, so it is the only thing standing between one account and photos
	// another account was entitled to.
	let key = cache_key(app.state::<AppState>().active_profile_id(), &url);
	let proxy = app.state::<MediaProxy>();

	if let Some(hit) = proxy.cache.lock().await.get(&key) {
		return deliver_ranged(&hit, range, is_head);
	}
	if proxy.oversized.lock().await.contains(&key) {
		return serve_windowed(app, &url, fetcher, range, is_head).await;
	}

	let flight = proxy.flights.acquire(&key).await;
	if let Some(hit) = proxy.cache.lock().await.get(&key) {
		return deliver_ranged(&hit, range, is_head);
	}
	if proxy.oversized.lock().await.contains(&key) {
		drop(flight);
		return serve_windowed(app, &url, fetcher, range, is_head).await;
	}

	let fetched = match fetch(app, &url, fetcher, None).await {
		Ok(fetched) => fetched,
		Err(FetchError::Oversized) => {
			proxy.oversized.lock().await.insert(key);
			drop(flight);
			return serve_windowed(app, &url, fetcher, range, is_head).await;
		}
		Err(error) => return refusal(error, &url),
	};

	if deliverable_status(fetched.status) == Some(StatusCode::OK) {
		let media = CachedMedia {
			content_type: fetched.content_type,
			body: fetched.body,
		};
		proxy.cache.lock().await.put(&key, media.clone());
		return deliver_ranged(&media, range, is_head);
	}
	deliver_upstream(fetched, is_head)
}

#[cfg(test)]
mod tests {
	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

	use crate::state::AppState;

	use super::*;

	const PHOTO: &str = "https://cdns.grindr.com/images/thumb/320x320/ff";

	fn image(url: &str) -> Option<Target> {
		Some(Target {
			url: url.to_owned(),
			fetcher: grindr::MediaFetcher::ImageLoader,
		})
	}

	fn app_without_a_client() -> tauri::App<MockRuntime> {
		mock_builder()
			.manage(MediaProxy::default())
			.manage(AppState::default())
			.build(mock_context(noop_assets()))
			.expect("mock app")
	}

	async fn cache(
		app: &tauri::App<MockRuntime>,
		url: &str,
		body: &'static [u8],
	) {
		app.state::<MediaProxy>().cache.lock().await.put(
			&cache_key(None, url),
			CachedMedia {
				content_type: Some("image/webp".to_owned()),
				body: grindr::Bytes::from_static(body),
			},
		);
	}

	#[tokio::test]
	async fn a_cached_url_is_served_without_reaching_the_client() {
		let app = app_without_a_client();
		cache(&app, PHOTO, b"webpbytes").await;

		let response = serve(app.handle(), image(PHOTO), None, false).await;

		assert_eq!(response.status(), StatusCode::OK);
		assert_eq!(response.body().as_slice(), b"webpbytes");
		assert_eq!(
			response.headers().get(header::CONTENT_TYPE).unwrap(),
			"image/webp"
		);
	}

	#[tokio::test]
	async fn a_rotated_signature_hits_what_the_previous_one_stored() {
		let app = app_without_a_client();
		cache(
			&app,
			"https://d3.cloudfront.net/a.jpg?Expires=1&Signature=OLD",
			b"jpegbytes",
		)
		.await;

		let response = serve(
			app.handle(),
			image("https://d3.cloudfront.net/a.jpg?Expires=2&Signature=NEW"),
			None,
			false,
		)
		.await;

		assert_eq!(response.status(), StatusCode::OK);
		assert_eq!(response.body().as_slice(), b"jpegbytes");
	}

	#[tokio::test]
	async fn a_request_arriving_before_the_client_exists_is_refused() {
		let app = app_without_a_client();

		let response = serve(app.handle(), image(PHOTO), None, false).await;

		assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
		assert!(response.body().is_empty());
	}

	#[tokio::test]
	async fn a_ranged_request_is_sliced_out_of_the_cached_body() {
		let app = app_without_a_client();
		cache(&app, PHOTO, b"whole").await;

		let response = serve(
			app.handle(),
			image(PHOTO),
			Some("bytes=0-1".to_owned()),
			false,
		)
		.await;

		assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
		assert_eq!(response.body().as_slice(), b"wh");
		assert_eq!(
			response.headers().get(header::CONTENT_RANGE).unwrap(),
			"bytes 0-1/5"
		);
	}

	#[tokio::test]
	async fn a_seek_into_the_cached_body_needs_no_network() {
		let app = app_without_a_client();
		cache(&app, PHOTO, b"whole").await;

		let response = serve(
			app.handle(),
			image(PHOTO),
			Some("bytes=2-".to_owned()),
			false,
		)
		.await;

		assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
		assert_eq!(response.body().as_slice(), b"ole");
		assert_eq!(
			response.headers().get(header::CONTENT_RANGE).unwrap(),
			"bytes 2-4/5"
		);
	}

	#[tokio::test]
	async fn an_uncached_ranged_request_still_needs_the_client() {
		let app = app_without_a_client();

		let response = serve(
			app.handle(),
			image(PHOTO),
			Some("bytes=0-1".to_owned()),
			false,
		)
		.await;

		assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
	}

	#[tokio::test]
	async fn one_account_is_never_served_what_another_one_cached() {
		let app = app_without_a_client();
		let proxy = app.state::<MediaProxy>();
		proxy.cache.lock().await.put(
			&cache_key(Some(1), PHOTO),
			CachedMedia {
				content_type: Some("image/webp".to_owned()),
				body: grindr::Bytes::from_static(b"theirs"),
			},
		);

		// Asking as nobody in particular, which is what an app with no active
		// account does: the entry above must be invisible, and with no client to
		// fetch with the request can only be refused.
		let response = serve(app.handle(), image(PHOTO), None, false).await;

		assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
	}

	#[tokio::test]
	async fn forgetting_one_account_leaves_the_others_cached() {
		let app = app_without_a_client();
		let proxy = app.state::<MediaProxy>();
		for (profile_id, body) in [(1u64, b"ours"), (2u64, b"mine")] {
			proxy.cache.lock().await.put(
				&cache_key(Some(profile_id), PHOTO),
				CachedMedia {
					content_type: None,
					body: grindr::Bytes::from_static(body),
				},
			);
		}
		proxy
			.oversized
			.lock()
			.await
			.insert(cache_key(Some(1), PHOTO));

		proxy.forget_account(1).await;

		let mut cache = proxy.cache.lock().await;
		assert!(cache.get(&cache_key(Some(1), PHOTO)).is_none());
		assert!(cache.get(&cache_key(Some(2), PHOTO)).is_some());
		assert!(proxy.oversized.lock().await.is_empty());
	}

	#[tokio::test]
	async fn forgetting_everything_clears_the_oversized_marks_too() {
		let app = app_without_a_client();
		let proxy = app.state::<MediaProxy>();
		proxy.oversized.lock().await.insert(PHOTO.to_owned());

		proxy.forget_everything().await;

		assert!(proxy.oversized.lock().await.is_empty());
	}

	#[tokio::test]
	async fn an_undecodable_target_is_refused_before_anything_else() {
		let app = app_without_a_client();

		let response = serve(app.handle(), None, None, false).await;

		assert_eq!(response.status(), StatusCode::BAD_REQUEST);
	}
}
