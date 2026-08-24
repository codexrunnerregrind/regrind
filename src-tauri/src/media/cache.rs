use std::collections::HashMap;

use grindr::Bytes;

use crate::storage::ProfileId;

const MAX_TOTAL_BYTES: usize = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES: usize = super::MAX_MEDIA_BYTES;

#[derive(Clone)]
pub struct CachedMedia {
	pub content_type: Option<String>,
	pub body: Bytes,
}

struct Entry {
	last_used: u64,
	media: CachedMedia,
}

#[derive(Default)]
pub struct MediaCache {
	entries: HashMap<String, Entry>,
	bytes: usize,
	clock: u64,
}

/// How one account's entries are told apart from another's. A signed-out app
/// (or a sign-in in flight) has no account to scope by and gets its own scope,
/// which holds nothing an account could have fetched.
pub fn scope_of(profile_id: Option<ProfileId>) -> String {
	match profile_id {
		Some(profile_id) => format!("{profile_id}\0"),
		None => "anon\0".to_owned(),
	}
}

/// The key one URL is cached under, for one account.
///
/// The CloudFront signature has to come off the key — it rotates on every
/// fetch, so leaving it on would mean never hitting the cache. What is left is
/// a bare URL that says nothing about who was allowed to fetch it, so the
/// account is prepended: without it a photo fetched by one account would be
/// served to another straight from the cache, with the entitlement check that
/// only the server can make never happening at all.
pub fn cache_key(profile_id: Option<ProfileId>, url: &str) -> String {
	let mut key = scope_of(profile_id);
	let Some((base, query)) = url.split_once('?') else {
		key.push_str(url);
		return key;
	};
	let signature_rotates_per_fetch =
		base.contains("cloudfront.net") && query.contains("Signature");
	key.push_str(if signature_rotates_per_fetch {
		base
	} else {
		url
	});
	key
}

impl MediaCache {
	pub fn get(&mut self, key: &str) -> Option<CachedMedia> {
		self.clock += 1;
		let entry = self.entries.get_mut(key)?;
		entry.last_used = self.clock;
		Some(entry.media.clone())
	}

	pub fn put(&mut self, key: &str, media: CachedMedia) {
		if media.body.len() > MAX_ENTRY_BYTES {
			return;
		}
		self.clock += 1;
		self.remove(key);
		self.bytes += media.body.len();
		self.entries.insert(
			key.to_owned(),
			Entry {
				last_used: self.clock,
				media,
			},
		);
		while self.bytes > MAX_TOTAL_BYTES {
			let Some(oldest) = self
				.entries
				.iter()
				.min_by_key(|(_, entry)| entry.last_used)
				.map(|(key, _)| key.clone())
			else {
				break;
			};
			self.remove(&oldest);
		}
	}

	pub fn clear(&mut self) {
		self.entries.clear();
		self.bytes = 0;
	}

	/// Drops one account's entries, leaving every other account's alone.
	pub fn clear_scope(&mut self, scope: &str) {
		let doomed: Vec<_> = self
			.entries
			.keys()
			.filter(|key| key.starts_with(scope))
			.cloned()
			.collect();
		for key in doomed {
			self.remove(&key);
		}
	}

	fn remove(&mut self, key: &str) {
		if let Some(entry) = self.entries.remove(key) {
			self.bytes -= entry.media.body.len();
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn media(size: usize) -> CachedMedia {
		CachedMedia {
			content_type: Some("image/jpeg".to_owned()),
			body: Bytes::from(vec![0u8; size]),
		}
	}

	fn cache_of(entries: &[(&str, usize)]) -> MediaCache {
		let mut cache = MediaCache::default();
		for (key, size) in entries {
			cache.put(key, media(*size));
		}
		cache
	}

	#[test]
	fn a_signed_cloudfront_url_keys_on_everything_but_its_signature() {
		let key = cache_key(
			Some(42),
			"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Expires=1&Signature=xy&Key-Pair-Id=K1",
		);
		assert_eq!(key, "42\0https://d3lyqctnm3b6pb.cloudfront.net/a.jpg");
	}

	#[test]
	fn every_other_url_keys_on_itself() {
		for url in [
			"https://cdns.grindr.com/images/thumb/320x320/abc",
			"https://cdns.grindr.com/images/thumb/320x320/abc?v=2",
			"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Expires=1",
		] {
			assert_eq!(cache_key(Some(42), url), format!("42\0{url}"));
		}
	}

	#[test]
	fn the_same_url_keys_differently_for_each_account() {
		const URL: &str = "https://cdns.grindr.com/images/thumb/320x320/abc";

		let mine = cache_key(Some(1), URL);
		let theirs = cache_key(Some(2), URL);
		let nobodys = cache_key(None, URL);

		assert_ne!(mine, theirs);
		assert_ne!(mine, nobodys);
		assert!(mine.ends_with(URL));
	}

	#[test]
	fn clearing_one_scope_leaves_the_others_and_their_bytes_alone() {
		let mut cache = cache_of(&[
			(&cache_key(Some(1), "a"), 1024),
			(&cache_key(Some(2), "a"), 512),
		]);

		cache.clear_scope(&scope_of(Some(1)));

		assert_eq!(cache.bytes, 512);
		assert!(cache.get(&cache_key(Some(1), "a")).is_none());
		assert!(cache.get(&cache_key(Some(2), "a")).is_some());
	}

	#[test]
	fn a_stored_entry_comes_back_whole() {
		let mut cache = cache_of(&[("a", 8)]);

		let hit = cache.get("a").expect("stored entry");
		assert_eq!(hit.body.len(), 8);
		assert_eq!(hit.content_type.as_deref(), Some("image/jpeg"));
		assert!(cache.get("b").is_none());
	}

	#[test]
	fn re_storing_a_key_does_not_double_count_its_bytes() {
		let cache = cache_of(&[("a", 1024), ("a", 1024)]);

		assert_eq!(cache.bytes, 1024);
		assert_eq!(cache.entries.len(), 1);
	}

	#[test]
	fn an_entry_too_large_to_be_worth_holding_is_not_stored() {
		let mut cache = cache_of(&[("big", MAX_ENTRY_BYTES + 1)]);

		assert!(cache.get("big").is_none());
		assert_eq!(cache.bytes, 0);
	}

	#[test]
	fn the_least_recently_used_entry_is_evicted_first() {
		let mut cache =
			cache_of(&[("a", MAX_ENTRY_BYTES), ("b", MAX_ENTRY_BYTES)]);
		while cache.bytes + MAX_ENTRY_BYTES <= MAX_TOTAL_BYTES {
			cache.put(
				&format!("filler{}", cache.entries.len()),
				media(MAX_ENTRY_BYTES),
			);
		}
		cache.get("a").expect("a is still cached");

		cache.put("last", media(MAX_ENTRY_BYTES));

		assert!(cache.bytes <= MAX_TOTAL_BYTES);
		assert!(cache.get("a").is_some(), "a was used more recently than b");
		assert!(cache.get("b").is_none());
	}

	#[test]
	fn clearing_drops_every_entry_and_its_bytes() {
		let mut cache = cache_of(&[("a", 1024), ("b", 2048)]);

		cache.clear();

		assert!(cache.get("a").is_none());
		assert_eq!(cache.bytes, 0);
	}
}
