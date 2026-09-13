use std::io::Write;

use semver::Version;

use super::*;

#[tokio::test]
#[ignore]
async fn live_published_release_downloads_and_verifies() {
	let previous = Version::parse("0.1.0-beta.2").unwrap();
	let channel = baseline::Channel::of_host(&baseline::HostVersion::of(
		previous.clone(),
	));
	let index = release::fetch_index(&component::APP, channel)
		.await
		.expect("release index");
	let suffix = install::release_asset_suffix()
		.expect("this platform publishes a release artifact");
	let candidate = release::newest_upgrade(
		&index,
		&component::APP,
		&baseline::Baseline::of_version(previous),
		channel,
		&suffix,
	)
	.expect("the newest release is signed")
	.expect("a release newer than 0.1.0-beta.2 is published");

	download_and_verify(&candidate).await;
}

#[tokio::test]
#[ignore]
async fn live_companion_first_install_downloads_and_verifies() {
	let host = baseline::HostVersion::of(Version::parse("0.1.0").unwrap());
	let channel = baseline::Channel::of_host(&host);
	let index = release::fetch_index(&component::GOOGLE_OAUTH, channel)
		.await
		.expect("companion release index");
	let suffix = component::abi_token("android", "aarch64")
		.expect("arm64 publishes a companion asset");
	let candidate = release::newest_upgrade(
		&index,
		&component::GOOGLE_OAUTH,
		&baseline::Baseline::Absent,
		channel,
		suffix,
	)
	.expect("the newest companion release is signed")
	.expect("a companion release is published");

	assert_eq!(candidate.component, component::GOOGLE_OAUTH.key);
	assert_eq!(candidate.kind, baseline::InstallKind::Install);
	assert!(
		candidate
			.payload
			.name
			.starts_with("open-grind-google-oauth-v"),
		"{}",
		candidate.payload.name
	);
	download_and_verify(&candidate).await;
}

async fn download_and_verify(candidate: &release::Candidate) {
	println!(
		"release {} payload {} ({} bytes) uuid {}",
		candidate.version,
		candidate.payload.name,
		candidate.payload.size,
		candidate.payload.uuid
	);

	let client = client::build().unwrap();
	let signature = client::get(&client, &candidate.signature.url)
		.send()
		.await
		.unwrap()
		.text()
		.await
		.unwrap();

	let mut response = client::get(&client, &candidate.payload.url)
		.send()
		.await
		.unwrap();
	assert_eq!(response.status().as_u16(), 200);
	assert_eq!(
            response.headers()["etag"].to_str().unwrap(),
            format!("\"{}\"", candidate.payload.uuid),
            "the download ETag is the asset uuid, which is what change detection relies on"
        );

	let path = std::env::temp_dir()
		.join(format!("regrind-live-{}", candidate.payload.name));
	let mut file = std::fs::File::create(&path).unwrap();
	let mut written = 0u64;
	while let Some(chunk) = response.chunk().await.unwrap() {
		file.write_all(&chunk).unwrap();
		written += chunk.len() as u64;
	}
	file.sync_data().unwrap();
	assert_eq!(written, candidate.payload.size);

	verify::verify_detached(&signature, &path, &candidate.payload.name)
		.expect("published signature verifies");

	let mut tampered = std::fs::read(&path).unwrap();
	let last = tampered.len() - 1;
	tampered[last] ^= 0xff;
	let tampered_path = path.with_extension("tampered");
	std::fs::write(&tampered_path, &tampered).unwrap();
	verify::verify_detached(
		&signature,
		&tampered_path,
		&candidate.payload.name,
	)
	.expect_err("a flipped byte must fail verification");

	std::fs::remove_file(&path).ok();
	std::fs::remove_file(&tampered_path).ok();
}

#[tokio::test]
#[ignore]
async fn live_release_host_supports_the_resume_protocol() {
	let previous = Version::parse("0.1.0-beta.2").unwrap();
	let channel = baseline::Channel::of_host(&baseline::HostVersion::of(
		previous.clone(),
	));
	let index = release::fetch_index(&component::APP, channel)
		.await
		.expect("release index");
	let suffix = install::release_asset_suffix()
		.expect("this platform publishes a release artifact");
	let candidate = release::newest_upgrade(
		&index,
		&component::APP,
		&baseline::Baseline::of_version(previous),
		channel,
		&suffix,
	)
	.expect("the newest release is signed")
	.expect("a release newer than 0.1.0-beta.2 is published");
	let client = client::build().unwrap();

	let partial = client::get(&client, &candidate.payload.url)
		.header(wreq::header::RANGE, "bytes=0-99")
		.header(
			wreq::header::IF_RANGE,
			format!("\"{}\"", candidate.payload.uuid),
		)
		.send()
		.await
		.unwrap();
	assert_eq!(partial.status().as_u16(), 206);
	println!(
		"content-range: {}",
		partial.headers()["content-range"].to_str().unwrap()
	);

	let stale = client::get(&client, &candidate.payload.url)
		.header(wreq::header::RANGE, "bytes=0-99")
		.header(
			wreq::header::IF_RANGE,
			"\"00000000-0000-0000-0000-000000000000\"",
		)
		.send()
		.await
		.unwrap();
	assert_eq!(
		stale.status().as_u16(),
		200,
		"a stale validator must return the whole file, never a spliced range"
	);
}
