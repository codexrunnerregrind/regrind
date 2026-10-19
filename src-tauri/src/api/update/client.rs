use std::time::Duration;

use wreq::header::{HeaderValue, ACCEPT_ENCODING, USER_AGENT};
use wreq::{redirect, Client, RequestBuilder, Response};

use super::error::UpdateError;

const RELEASE_ORIGIN: &str = "https://git.opengrind.org/";
const GITHUB_API: &str = "https://api.github.com/";
pub(super) const FORK_REPO: &str = "codexrunnerregrind/regrind";
// GitHub answers release downloads with a redirect to its asset CDN.
const GITHUB_ASSET_HOSTS: [&str; 2] = [
	"https://release-assets.githubusercontent.com/",
	"https://objects.githubusercontent.com/",
];

pub fn origin() -> String {
	super::dev::origin().unwrap_or_else(|| RELEASE_ORIGIN.to_owned())
}

pub fn github_api() -> String {
	super::dev::origin().unwrap_or_else(|| GITHUB_API.to_owned())
}

fn fork_downloads() -> String {
	format!("https://github.com/{FORK_REPO}/releases/download/")
}

fn release_prefixes() -> Vec<String> {
	match super::dev::origin() {
		Some(origin) => vec![origin],
		None => vec![RELEASE_ORIGIN.to_owned(), fork_downloads()],
	}
}

fn redirect_prefixes() -> Vec<String> {
	let mut prefixes = release_prefixes();
	if super::dev::origin().is_none() {
		prefixes.extend(GITHUB_ASSET_HOSTS.map(str::to_owned));
	}
	prefixes
}

pub fn build() -> Result<Client, UpdateError> {
	Client::builder()
		.https_only(origin().starts_with("https://"))
		.min_tls_version(wreq::tls::TlsVersion::TLS_1_2)
		.redirect(release_hosts_only(redirect_prefixes()))
		.referer(false)
		.connect_timeout(Duration::from_secs(15))
		.read_timeout(Duration::from_secs(30))
		.pool_idle_timeout(Duration::from_secs(10))
		.pool_max_idle_per_host(1)
		.build()
		.map_err(|e| UpdateError::Network(e.to_string()))
}

// Identity encoding keeps a 206 body a byte range of the real file.
// GitHub's API refuses requests without a User-Agent; the value is the same
// for every install.
pub fn get(client: &Client, url: &str) -> RequestBuilder {
	client
		.get(url)
		.header(ACCEPT_ENCODING, HeaderValue::from_static("identity"))
		.header(USER_AGENT, HeaderValue::from_static("regrind"))
}

fn release_hosts_only(prefixes: Vec<String>) -> redirect::Policy {
	redirect::Policy::custom(move |attempt| {
		match follow_redirect(
			&prefixes,
			attempt.url().as_str(),
			attempt.previous().len(),
		) {
			Ok(()) => attempt.follow(),
			Err(refusal) => attempt.error(refusal),
		}
	})
}

fn follow_redirect(
	prefixes: &[String],
	url: &str,
	hops: usize,
) -> Result<(), &'static str> {
	if hops >= 3 {
		return Err("too many redirects");
	}
	if prefixes
		.iter()
		.any(|prefix| url.starts_with(prefix.as_str()))
	{
		Ok(())
	} else {
		Err("redirect leaves the release host")
	}
}

pub async fn text_within(
	mut response: Response,
	max: usize,
	reject: fn(String) -> UpdateError,
) -> Result<String, UpdateError> {
	let mut body = Vec::new();
	while let Some(chunk) = response
		.chunk()
		.await
		.map_err(|e| UpdateError::Network(e.to_string()))?
	{
		if body.len() + chunk.len() > max {
			return Err(reject("response is implausibly large".into()));
		}
		body.extend_from_slice(&chunk);
	}
	String::from_utf8(body).map_err(|_| reject("response is not text".into()))
}

pub fn assert_release_origin(url: &str) -> Result<(), UpdateError> {
	let sane = release_prefixes().iter().any(|prefix| {
		url.starts_with(prefix.as_str()) && url.len() > prefix.len()
	}) && !url
		.contains(|c: char| c.is_control() || c.is_whitespace());
	if sane {
		Ok(())
	} else {
		Err(UpdateError::ForeignUrl(url.to_owned()))
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn accepts_urls_under_the_release_origin() {
		let url = format!("{}releases/download/v1.2.3/app.apk", origin());
		assert!(assert_release_origin(&url).is_ok());
		let fork = format!("{}v1.2.3/app.apk", fork_downloads());
		assert!(assert_release_origin(&fork).is_ok());
	}

	#[test]
	fn rejects_other_hosts_and_userinfo_smuggling() {
		for url in [
			"https://evil.example/app.apk",
			"http://git.opengrind.org/app.apk",
			"https://git.opengrind.org.evil.example/app.apk",
			"https://git.opengrind.org@evil.example/app.apk",
			"https://git.opengrind.org",
			"https://git.opengrind.org/app.apk\nHost: evil",
			"https://github.com/someone/else/releases/download/v1/app.apk",
			"https://release-assets.githubusercontent.com/app.apk",
		] {
			assert!(assert_release_origin(url).is_err(), "accepted {url}");
		}
	}

	fn header_names(request: &wreq::Request) -> Vec<String> {
		let mut names: Vec<_> = request
			.headers()
			.keys()
			.map(|key| key.as_str().to_owned())
			.collect();
		names.sort();
		names
	}

	#[test]
	fn a_request_carries_nothing_that_identifies_the_install() {
		let client = build().unwrap();
		let request = get(&client, "https://git.opengrind.org/api/v1/version")
			.build()
			.unwrap();

		assert_eq!(
			header_names(&request),
			vec!["accept-encoding", "user-agent"]
		);
		assert_eq!(request.headers()["accept-encoding"], "identity");
		assert_eq!(request.headers()["user-agent"], "regrind");
	}

	#[test]
	fn a_resumed_transfer_adds_only_range_headers() {
		let client = build().unwrap();
		let request = get(&client, "https://git.opengrind.org/x.apk")
			.header(wreq::header::RANGE, "bytes=100-")
			.header(wreq::header::IF_RANGE, "\"bb49c042\"")
			.build()
			.unwrap();

		assert_eq!(
			header_names(&request),
			vec!["accept-encoding", "if-range", "range", "user-agent"]
		);
	}

	#[test]
	fn redirects_stay_on_the_release_hosts() {
		let prefixes = redirect_prefixes();
		let allowed = format!("{}releases/download/v1/app.apk", origin());
		assert!(follow_redirect(&prefixes, &allowed, 0).is_ok());
		assert!(follow_redirect(&prefixes, &allowed, 2).is_ok());
		assert!(follow_redirect(&prefixes, &allowed, 3).is_err());
		let cdn = "https://release-assets.githubusercontent.com/github-production-release-asset/1/2";
		assert!(follow_redirect(&prefixes, cdn, 1).is_ok());
		for url in [
			"https://evil.example/app.apk",
			"https://git.opengrind.org.evil.example/app.apk",
			"https://git.opengrind.org@evil.example/app.apk",
			"http://git.opengrind.org/app.apk",
			"https://release-assets.githubusercontent.com.evil.example/a",
		] {
			assert!(
				follow_redirect(&prefixes, url, 0).is_err(),
				"followed {url}"
			);
		}
	}
}
