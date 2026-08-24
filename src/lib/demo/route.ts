import { accountPreferencesUpdateSchema } from "$lib/model/settings/account";
import { demoMeProfileId } from "./config";
import {
	demoAlbumContent,
	demoAlbumSharesFor,
	demoAlbumsSharedByProfile,
	demoCreateAlbum,
	demoDeleteAlbum,
	demoDeleteAlbumContent,
	demoMyAlbums,
	demoRenameAlbum,
	demoReorderAlbumContent,
	demoShareAlbum,
	demoSharedAlbumsFeed,
	demoUnshareAlbum,
} from "./mock/albums";
import { demoBlockedUsers, demoSetBlocked } from "./mock/blocks";
import {
	demoConversationMessages,
	demoConversations,
	demoDeleteConversation,
	demoSentMessage,
	demoSetConversationMuted,
	demoSetConversationPinned,
	demoSingleMessage,
} from "./mock/conversations";
import { demoDrawerMedia } from "./mock/drawer";
import {
	demoDeleteFavoriteNote,
	demoFavoriteNote,
	demoSetFavoriteNote,
} from "./mock/favorite-notes";
import { demoSetFavorite } from "./mock/favorites";
import {
	buildFullProfile,
	buildMaskedProfile,
	demoCascadeV4,
	demoFavoriteNotes,
	demoGetProfiles,
	demoMyUploadedPhotos,
	demoSearchProfiles,
	num,
} from "./mock/grid";
import {
	demoHiddenUsers,
	demoProfileHidden,
	demoSetHidden,
} from "./mock/hides";
import { demoReceivedTaps, demoViews } from "./mock/interest";
import {
	demoCreateSavedPhrase,
	demoDeleteSavedPhrase,
	demoSavedPhrases,
} from "./mock/phrases";
import { profileSeed } from "./mock/profiles";
import { demoGenders, demoPronouns, demoTags } from "./mock/reference";
import { demoRightNowFeed } from "./mock/right-now";
import {
	demoAccountPreferences,
	demoSetAccountPreferences,
} from "./mock/settings";

type DemoResponse = { status: number; body: unknown };

function ok(body: unknown): DemoResponse {
	return { status: 200, body };
}

export function demoCallMethod(method: string): unknown {
	switch (method) {
		case "auth_state":
			return demoMeProfileId;
		case "login":
		case "login_with_google":
		case "google_sign_in":
		case "refresh_token":
			return { profileId: demoMeProfileId, restriction: null };
		case "rotate_api_params":
			return { "user-agent": "demo", "l-device-info": "demo" };
		case "recaptcha_first_party_enabled":
			return false;
		case "session_health":
			return { signedIn: true, expiresAt: null, stale: false };
		// Demo mode is one made-up account, so the switcher shows exactly it and
		// nothing can be added or switched to.
		case "accounts_list":
			return [
				{
					profileId: demoMeProfileId,
					label: "demo@example.com",
					addedAt: 0,
					active: true,
				},
			];
		case "account_add_in_progress":
			return false;
		default:
			return null;
	}
}

export function demoRoute({
	path,
	method,
	body,
}: {
	path: string;
	method: string;
	body: unknown;
}): DemoResponse {
	const [rawPath = "", queryString = ""] = path.split("?");
	const params = new URLSearchParams(queryString);
	const segments = rawPath.split("/").filter(Boolean);
	const conversationId = segments[3] ?? "";
	const messageId = segments[5] ?? "";

	if (method === "GET" && rawPath === "/v4/cascade") {
		return ok(demoCascadeV4(params));
	}
	if (method === "GET" && rawPath === "/v7/search") {
		return ok({ profiles: demoSearchProfiles(params) });
	}
	if (method === "GET" && rawPath.startsWith("/v7/profiles/")) {
		const id = Number(segments.at(-1));
		const seed = profileSeed(id);
		return ok({
			profiles: [
				demoProfileHidden(id)
					? buildMaskedProfile(seed)
					: buildFullProfile(seed),
			],
		});
	}
	if (method === "POST" && rawPath === "/v3/profiles") {
		const ids =
			(body as { targetProfileIds?: number[] })?.targetProfileIds ?? [];
		return ok({ profiles: demoGetProfiles(ids) });
	}
	if (rawPath === "/v3.1/me/profile/images" && method === "GET") {
		return ok(demoMyUploadedPhotos());
	}
	if (rawPath === "/public/v2/genders") return ok(demoGenders);
	if (rawPath === "/v1/pronouns") return ok(demoPronouns);
	if (rawPath === "/v1/tags") return ok(demoTags);
	if (rawPath === "/v2/taps/received")
		return ok({ profiles: demoReceivedTaps() });
	if (rawPath === "/v2/taps/add") return ok({ isMutual: false });
	if (rawPath === "/v7/views/list") return ok(demoViews());
	if (rawPath === "/v1/chat/phrases") {
		if (method === "GET") return ok({ phrases: demoSavedPhrases() });
		if (method === "POST") {
			const { text = "" } = (body as { text?: string }) ?? {};
			return ok({ phrase: demoCreateSavedPhrase(text) });
		}
	}
	if (
		method === "DELETE" &&
		segments[0] === "v3" &&
		segments[1] === "me" &&
		segments[2] === "prefs" &&
		segments[3] === "phrases" &&
		segments.length === 5
	) {
		demoDeleteSavedPhrase(segments[4] ?? "");
		return ok({});
	}
	if (
		method === "POST" &&
		segments[0] === "v4" &&
		segments[1] === "phrases" &&
		segments[2] === "frequency"
	) {
		return ok({});
	}
	if (method === "GET" && rawPath === "/v1/favorites/notes")
		return ok(demoFavoriteNotes());
	if (rawPath === "/v3.1/me/blocks")
		return ok({ blocking: demoBlockedUsers() });
	if (
		(method === "POST" || method === "DELETE") &&
		segments[0] === "v3" &&
		segments[1] === "me" &&
		segments[2] === "blocks" &&
		segments.length === 4
	) {
		demoSetBlocked({
			profileId: Number(segments[3]),
			blocked: method === "POST",
		});
		return ok(method === "POST" ? { updateTime: 0 } : {});
	}
	if (method === "GET" && rawPath === "/v1/hides")
		return ok({ hides: demoHiddenUsers() });
	if (
		method === "POST" &&
		segments[0] === "v1" &&
		segments[1] === "me" &&
		segments[2] === "hides" &&
		segments.length === 4
	) {
		demoSetHidden({ profileId: Number(segments[3]), hidden: true });
		return ok({});
	}
	if (
		method === "DELETE" &&
		segments[0] === "v1" &&
		segments[1] === "hides" &&
		segments.length === 3
	) {
		demoSetHidden({ profileId: Number(segments[2]), hidden: false });
		return ok({});
	}
	if (
		segments[0] === "v1" &&
		segments[1] === "favorites" &&
		segments[2] === "notes" &&
		segments.length === 4
	) {
		const profileId = Number(segments[3]);
		if (method === "GET") {
			const note = demoFavoriteNote(profileId);
			// The real endpoint has no note resource for an un-annotated favorite.
			if (note === null) return { status: 404, body: null };
			// Content only, no `counterpartyId`: the real per-profile response omits
			// it, unlike the entries in the list response.
			return ok(note);
		}
		if (method === "PUT") {
			const { notes = "", phoneNumber = "" } =
				(body as { notes?: string; phoneNumber?: string }) ?? {};
			demoSetFavoriteNote(profileId, { notes, phoneNumber });
			return { status: 204, body: null };
		}
		if (method === "DELETE") {
			demoDeleteFavoriteNote(profileId);
			return { status: 204, body: null };
		}
	}
	if (
		segments[0] === "v3" &&
		segments[1] === "me" &&
		segments[2] === "favorites" &&
		segments.length === 4 &&
		(method === "POST" || method === "DELETE")
	) {
		demoSetFavorite({
			profileId: Number(segments[3]),
			favorite: method === "POST",
		});
		return ok({});
	}
	if (method === "POST" && rawPath === "/v4/inbox") {
		const filters = body as
			| {
					favoritesOnly?: boolean;
					unreadOnly?: boolean;
					onlineNowOnly?: boolean;
					distanceMeters?: number | null;
					positions?: number[];
			  }
			| undefined;
		return ok(
			demoConversations({
				page: num(params.get("page")) ?? 1,
				favoritesOnly: filters?.favoritesOnly ?? false,
				unreadOnly: filters?.unreadOnly ?? false,
				onlineNowOnly: filters?.onlineNowOnly ?? false,
				distanceMeters: filters?.distanceMeters ?? null,
				positions: filters?.positions ?? [],
			}),
		);
	}
	if (
		method === "GET" &&
		rawPath.startsWith("/v5/chat/conversation/") &&
		rawPath.endsWith("/message")
	) {
		return ok(
			demoConversationMessages({
				conversationId,
				pageKey: params.get("pageKey") ?? undefined,
			}),
		);
	}
	if (
		method === "GET" &&
		segments[0] === "v4" &&
		segments[2] === "conversation" &&
		segments[4] === "message" &&
		segments.length === 6
	) {
		return ok(demoSingleMessage({ conversationId, messageId }));
	}
	// Must precede the feed rule: the paywall path starts with it.
	if (
		method === "POST" &&
		rawPath.startsWith("/v3/pressie-albums/feed/paywall")
	) {
		// Nothing in the demo data is locked, so there is nothing to tease.
		return ok({ albumPaywallContent: [] });
	}
	if (method === "POST" && rawPath === "/v3/pressie-albums/feed") {
		return ok(demoSharedAlbumsFeed());
	}
	// Must precede the `/v2/albums/{albumId}` rule below, which only matches on
	// the first two segments and would otherwise swallow this path.
	if (
		method === "GET" &&
		segments[0] === "v2" &&
		segments[1] === "albums" &&
		segments[2] === "shares" &&
		segments.length === 4
	) {
		return ok(demoAlbumsSharedByProfile(Number(segments[3])));
	}
	if (method === "GET" && segments[0] === "v2" && segments[1] === "albums") {
		return ok(demoAlbumContent(Number(segments[2])));
	}
	if (method === "POST" && rawPath === "/v2/albums") {
		return ok(demoCreateAlbum(body));
	}
	if (
		method === "PUT" &&
		segments[0] === "v2" &&
		segments[1] === "albums" &&
		segments.length === 3
	) {
		return ok(demoRenameAlbum(Number(segments[2]), body));
	}
	if (
		method === "DELETE" &&
		segments[0] === "v1" &&
		segments[1] === "albums" &&
		segments.length === 3
	) {
		demoDeleteAlbum(Number(segments[2]));
		return ok({});
	}
	if (
		method === "GET" &&
		segments[0] === "v1" &&
		segments[1] === "albums" &&
		segments[3] === "shares" &&
		segments.length === 4
	) {
		return ok(demoAlbumSharesFor(Number(segments[2])));
	}
	if (
		method === "PUT" &&
		segments[0] === "v1" &&
		segments[1] === "albums" &&
		segments[3] === "unshares" &&
		segments.length === 4
	) {
		demoUnshareAlbum(Number(segments[2]), body);
		return ok({});
	}
	if (
		method === "POST" &&
		segments[0] === "v1" &&
		segments[1] === "albums" &&
		segments[3] === "content" &&
		segments[4] === "order" &&
		segments.length === 5
	) {
		demoReorderAlbumContent(Number(segments[2]), body);
		return ok({});
	}
	if (
		method === "DELETE" &&
		segments[0] === "v1" &&
		segments[1] === "albums" &&
		segments[3] === "content" &&
		segments.length === 5
	) {
		demoDeleteAlbumContent(Number(segments[2]), Number(segments[4]));
		return ok({});
	}
	if (method === "GET" && rawPath === "/v1/albums") {
		return ok(demoMyAlbums());
	}
	if (
		method === "POST" &&
		segments[0] === "v4" &&
		segments[1] === "albums" &&
		segments[3] === "shares" &&
		segments.length === 4
	) {
		demoShareAlbum(Number(segments[2]), body);
		return ok({});
	}
	if (method === "POST" && rawPath === "/v4/chat/message/send") {
		return ok(demoSentMessage(body));
	}
	if (
		method === "POST" &&
		segments[0] === "v4" &&
		segments[1] === "chat" &&
		segments[2] === "conversation" &&
		segments.length === 5 &&
		(segments[4] === "pin" || segments[4] === "unpin")
	) {
		demoSetConversationPinned({
			conversationId,
			pinned: segments[4] === "pin",
		});
		return ok({});
	}
	if (
		method === "POST" &&
		segments[0] === "v1" &&
		segments[1] === "push" &&
		segments[2] === "conversation" &&
		segments.length === 5 &&
		(segments[4] === "mute" || segments[4] === "unmute")
	) {
		demoSetConversationMuted({
			conversationId,
			muted: segments[4] === "mute",
		});
		return ok({});
	}
	if (
		method === "DELETE" &&
		segments[0] === "v4" &&
		segments[1] === "chat" &&
		segments[2] === "conversation" &&
		segments.length === 4
	) {
		demoDeleteConversation(conversationId);
		return ok({});
	}
	if (method === "GET" && rawPath.startsWith("/v4/chat/media/drawer/")) {
		return ok(demoDrawerMedia());
	}
	if (method === "GET" && rawPath === "/v3/places/search") {
		return ok({ places: [] });
	}
	if (method === "GET" && rawPath.startsWith("/v4/rightnow/feed")) {
		return ok(demoRightNowFeed(params));
	}
	if (rawPath === "/v3/me/prefs/settings") {
		if (method === "PUT") {
			demoSetAccountPreferences(
				accountPreferencesUpdateSchema.parse(body).settings,
			);
			return ok({});
		}
		return ok(demoAccountPreferences());
	}

	return ok({});
}
