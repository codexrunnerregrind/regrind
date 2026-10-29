import { describe, expect, it } from "vitest";
import z from "zod";

import { demoRoute } from "$lib/demo";
import { demoMeProfileId } from "$lib/demo/config";
import { cascadeV4ResponseSchema } from "$lib/model/browse/grid/cascade/response/v4";
import { searchProfileSchema } from "$lib/model/browse/grid/search";
import { matchesV1ResponseSchema } from "$lib/model/interest/matches";
import { tapProfileSchema } from "$lib/model/interest/tap-profile";
import {
	viewerProfileSchema,
	viewPreviewSchema,
} from "$lib/model/interest/views";
import {
	albumContentSchema,
	albumDetailsSchema,
	albumMinSchema,
	myAlbumsResponseSchema,
} from "$lib/model/messaging/albums";
import { fullConversationSchema } from "$lib/model/messaging/conversations";
import { previewLabel } from "$lib/model/messaging/message-preview";
import {
	apiResponseMessageSchema,
	expiringImageMessageSchema,
} from "$lib/model/messaging/messages";
import { favoriteNotesResponseSchema } from "$lib/model/users/favorites";
import { gendersSchema } from "$lib/model/users/genders";
import {
	profileRightNowSchema,
	profileSchema,
	profileShortSchema,
} from "$lib/model/users/profiles";
import { pronounsSchema } from "$lib/model/users/pronouns";
import { profileTagsResponseSchema } from "$lib/model/users/tags";

const shortProfileSchema = z.object({
	...profileShortSchema.shape,
	...profileRightNowSchema.shape,
});

const route = (path: string, method = "GET", body?: unknown) =>
	demoRoute({ path, method, body }).body;

describe("demo route data matches the real schemas", () => {
	const firstProfileId = (
		items: z.infer<typeof cascadeV4ResponseSchema>["items"],
	): number => {
		for (const item of items) {
			if ("data" in item && "profileId" in item.data)
				return item.data.profileId;
		}
		throw new Error("no profile item");
	};

	it("cascade grid page validates and paginates", () => {
		const page0 = cascadeV4ResponseSchema.parse(
			route("/v4/cascade?nearbyGeoHash=u00"),
		);
		expect(page0.items.length).toBeGreaterThan(0);
		expect(page0.nextPage).toBe(1);

		const page1 = cascadeV4ResponseSchema.parse(
			route("/v4/cascade?nearbyGeoHash=u00&pageNumber=1"),
		);
		expect(firstProfileId(page0.items)).not.toBe(
			firstProfileId(page1.items),
		);
	});

	it("a fresh cascade lists only profiles the profile route marks as new", () => {
		const newFlags = (query: string) => {
			const { items } = cascadeV4ResponseSchema.parse(
				route(`/v4/cascade?nearbyGeoHash=u00${query}`),
			);
			const { profiles } = route("/v3/profiles", "POST", {
				targetProfileIds: items.flatMap((item) =>
					"data" in item && "profileId" in item.data
						? [item.data.profileId]
						: [],
				),
			}) as { profiles: { isNew: boolean }[] };
			return profiles.map((profile) => profile.isNew);
		};

		expect(newFlags("")).toContain(false);
		expect(new Set(newFlags("&fresh=true"))).toEqual(new Set([true]));
	});

	it("full profile validates for an arbitrary id", () => {
		const body = route("/v7/profiles/100123") as { profiles: unknown[] };
		profileSchema.parse(body.profiles[0]);
	});

	it("profile batch validates", () => {
		const body = route("/v3/profiles", "POST", {
			targetProfileIds: [100001, 100002, 100250],
		}) as { profiles: unknown[] };
		expect(body.profiles).toHaveLength(3);
		for (const profile of body.profiles) shortProfileSchema.parse(profile);
	});

	it("own profile + uploaded photos validate", () => {
		const me = route(`/v7/profiles/${demoMeProfileId}`) as {
			profiles: unknown[];
		};
		profileSchema.parse(me.profiles[0]);
		z.object({
			medias: z.array(
				z.object({
					mediaHash: z.hex().length(40),
					type: z.number(),
					state: z.number(),
				}),
			),
		}).parse(route("/v3.1/me/profile/images"));
	});

	it("search validates", () => {
		const body = route("/v7/search?nearbyGeoHash=u00") as {
			profiles: unknown[];
		};
		for (const profile of body.profiles) searchProfileSchema.parse(profile);
	});

	it("conversations are sorted by last activity and previews are correct", () => {
		const body = route("/v4/inbox?page=1", "POST") as {
			entries: unknown[];
		};
		const entries = z.array(fullConversationSchema).parse(body.entries);
		const times = entries.map((e) => e.data.lastActivityTimestamp);
		expect(times).toEqual([...times].sort((a, b) => b - a));
		const albumConv = entries.find((e) => e.data.preview?.type === "Album");
		expect(albumConv?.data.preview?.albumId).not.toBeNull();
		expect(previewLabel(albumConv?.data.preview ?? null)).toBe("Album");
	});

	it("conversation messages validate and align with the preview", () => {
		const inbox = route("/v4/inbox?page=1", "POST") as {
			entries: {
				data: {
					conversationId: string;
					preview: { text: string | null };
				};
			}[];
		};
		for (const entry of inbox.entries) {
			const id = entry.data.conversationId;
			const body = route(
				`/v5/chat/conversation/${id}/message?profile=true`,
			) as { messages: unknown[]; lastReadTimestamp: number | null };
			const messages = z
				.array(apiResponseMessageSchema)
				.parse(body.messages);
			const [newest] = messages;
			const oldest = messages.at(-1);
			if (!newest || !oldest) throw new Error(`no messages in ${id}`);
			expect(newest.timestamp).toBeGreaterThanOrEqual(oldest.timestamp);
		}
	});

	const albumResponseSchema = z.object({
		...albumMinSchema.shape,
		...albumDetailsSchema.shape,
		content: z.array(
			z.object({
				...albumContentSchema.shape,
				remainingViews: z.int().optional(),
			}),
		),
	});

	it("album and expiring-image messages resolve to valid content", () => {
		const inbox = route("/v4/inbox?page=1", "POST") as {
			entries: { data: { conversationId: string } }[];
		};
		let albums = 0;
		let expiringImages = 0;
		for (const entry of inbox.entries) {
			const id = entry.data.conversationId;
			const body = route(
				`/v5/chat/conversation/${id}/message?profile=true`,
			) as { messages: unknown[] };
			const messages = z
				.array(apiResponseMessageSchema)
				.parse(body.messages);
			for (const message of messages) {
				if (
					message.type === "Album" ||
					message.type === "ExpiringAlbum" ||
					message.type === "ExpiringAlbumV2"
				) {
					albums++;
					const album = albumResponseSchema.parse(
						route(`/v2/albums/${message.body.albumId}`),
					);
					expect(album.content.length).toBeGreaterThan(0);
					const holds = (kind: string) =>
						album.content.some((item) =>
							item.contentType.startsWith(`${kind}/`),
						);
					expect({
						hasPhoto: message.body.hasPhoto,
						hasVideo: message.body.hasVideo,
					}).toEqual({
						hasPhoto: holds("image"),
						hasVideo: holds("video"),
					});
				} else if (message.type === "ExpiringImage") {
					expiringImages++;
					const single = expiringImageMessageSchema.parse(
						(
							route(
								`/v4/chat/conversation/${id}/message/${message.messageId}`,
							) as { message: unknown }
						).message,
					);
					if (message.body.viewsRemaining !== 0) {
						expect(single.body.url).not.toBeNull();
					}
				}
			}
		}
		expect(albums).toBeGreaterThan(0);
		expect(expiringImages).toBeGreaterThan(0);
	});

	// Not every album is shareable — the API marks one whose share allowance is
	// spent — so the seeds carry both states rather than only the happy one.
	it("my albums validate and cover both shareable states", () => {
		const { albums } = myAlbumsResponseSchema.parse(route("/v1/albums"));
		expect(albums.length).toBeGreaterThan(0);
		expect(albums.some((album) => album.isShareable)).toBe(true);
		expect(albums.some((album) => !album.isShareable)).toBe(true);
	});

	it("sharing an album succeeds", () => {
		const { albums } = myAlbumsResponseSchema.parse(route("/v1/albums"));
		const albumId = albums[0]?.albumId;
		const response = demoRoute({
			path: `/v4/albums/${albumId}/shares`,
			method: "POST",
			body: {
				profiles: [{ profileId: 100001, expirationType: "INDEFINITE" }],
			},
		});
		expect(response.status).toBe(200);
	});

	it("unsharing an album succeeds", () => {
		const response = demoRoute({
			path: "/v1/albums/294604/unshares",
			method: "PUT",
			body: { profiles: [{ profileId: 100001, shareId: "0" }] },
		});
		expect(response.status).toBe(200);
	});

	it("refreshes the requested messages of a demo thread", () => {
		const inbox = route("/v4/inbox?page=1", "POST") as {
			entries: { data: { conversationId: string } }[];
		};
		const id = inbox.entries[0]!.data.conversationId;
		const thread = z
			.array(apiResponseMessageSchema)
			.parse(
				(
					route(
						`/v5/chat/conversation/${id}/message?profile=true`,
					) as { messages: unknown[] }
				).messages,
			);
		const wanted = thread.slice(0, 2).map((m) => m.messageId);

		const refreshed = z
			.object({ messages: z.array(apiResponseMessageSchema) })
			.parse(
				route(`/v4/chat/conversation/${id}/message-by-id`, "POST", {
					messageIds: [...wanted, "missing"],
				}),
			);

		expect(refreshed.messages.map((m) => m.messageId)).toEqual(wanted);
	});

	it("paginated message requests are empty", () => {
		const body = route(
			"/v5/chat/conversation/100000:100001/message?profile=true&pageKey=x",
		) as { messages: unknown[] };
		expect(body.messages).toHaveLength(0);
	});

	it("sending a message echoes a valid message", () => {
		const body = route("/v4/chat/message/send", "POST", {
			type: "Text",
			target: { type: "Direct", targetId: 100001 },
			body: { text: "hi" },
		});
		apiResponseMessageSchema.parse(body);
	});

	it("sending a location preserves its coordinates", () => {
		const body = { lat: 52.52, lon: 13.405 };
		const sent = apiResponseMessageSchema.parse(
			route("/v4/chat/message/send", "POST", {
				type: "Location",
				target: { type: "Direct", targetId: 100001 },
				body,
			}),
		);
		expect(sent).toMatchObject({ type: "Location", body });
	});

	it("sending media echoes it back under the type it was sent as", () => {
		const send = (type: string, body: unknown) =>
			apiResponseMessageSchema.parse(
				route("/v4/chat/message/send", "POST", {
					type,
					target: { type: "Direct", targetId: 100001 },
					body,
				}),
			);

		expect(send("Image", { mediaId: 800_001 }).type).toBe("Image");
		expect(
			send("ExpiringImage", { mediaId: 800_001, expiring: true }).type,
		).toBe("ExpiringImage");
	});

	it("taps and views validate", () => {
		const taps = route("/v2/taps/received") as { profiles: unknown[] };
		for (const tap of taps.profiles) tapProfileSchema.parse(tap);

		const views = route("/v7/views/list") as {
			profiles: unknown[];
			previews: unknown[];
		};
		for (const profile of views.profiles)
			viewerProfileSchema.parse(profile);
		for (const preview of views.previews) viewPreviewSchema.parse(preview);
	});

	it("matches validate and page through the cursor", () => {
		const first = matchesV1ResponseSchema.parse(
			route("/v1/matches?limit=30"),
		);
		expect(first.matches).toHaveLength(30);
		expect(first.nextCursor).not.toBeNull();

		const second = matchesV1ResponseSchema.parse(
			route(`/v1/matches?limit=30&cursor=${first.nextCursor}`),
		);
		expect(first.matches.length + second.matches.length).toBe(first.total);
		expect(second.nextCursor).toBeNull();
	});

	it("favorite notes validate and hydrate to valid profiles", () => {
		const notes = favoriteNotesResponseSchema.parse(
			route("/v1/favorites/notes"),
		);
		expect(notes.length).toBeGreaterThan(0);

		const ids = notes.map((note) => note.counterpartyId);
		const { profiles } = route("/v3/profiles", "POST", {
			targetProfileIds: ids,
		}) as { profiles: unknown[] };
		expect(profiles).toHaveLength(ids.length);
		expect(
			profiles.every(
				(profile) => shortProfileSchema.parse(profile).isFavorite,
			),
		).toBe(true);
	});

	it("reference data validates and mutations are accepted no-ops", () => {
		gendersSchema.parse(route("/public/v2/genders"));
		pronounsSchema.parse(route("/v1/pronouns"));
		profileTagsResponseSchema.parse(route("/v1/tags"));
		expect(
			demoRoute({
				path: "/v4/me/profile",
				method: "PATCH",
				body: { aboutMe: "x" },
			}).status,
		).toBe(200);
		expect(
			demoRoute({
				path: "/v3/me/blocks/100001",
				method: "POST",
				body: undefined,
			}).status,
		).toBe(200);
		expect(
			demoRoute({
				path: "/v3/me/favorites/100001",
				method: "POST",
				body: undefined,
			}).status,
		).toBe(200);
	});

	it("conversation pin/mute/delete mutations persist across inbox fetches", () => {
		const inbox = () => {
			const body = route("/v4/inbox?page=1", "POST") as {
				entries: unknown[];
			};
			return z.array(fullConversationSchema).parse(body.entries);
		};
		const [first, second, third] = inbox();
		if (!first || !second || !third)
			throw new Error(
				"the demo inbox has fewer than three conversations",
			);

		route(
			`/v4/chat/conversation/${first.data.conversationId}/${first.data.pinned ? "unpin" : "pin"}`,
			"POST",
		);
		route(
			`/v1/push/conversation/${second.data.conversationId}/${second.data.muted ? "unmute" : "mute"}`,
			"POST",
		);
		route(`/v4/chat/conversation/${third.data.conversationId}`, "DELETE");

		const after = inbox();
		expect(
			after.find(
				(e) => e.data.conversationId === first.data.conversationId,
			)?.data.pinned,
		).toBe(!first.data.pinned);
		expect(
			after.find(
				(e) => e.data.conversationId === second.data.conversationId,
			)?.data.muted,
		).toBe(!second.data.muted);
		expect(
			after.some(
				(e) => e.data.conversationId === third.data.conversationId,
			),
		).toBe(false);
	});

	it("favorite mutations persist across inbox and profile fetches", () => {
		const inbox = () => {
			const body = route("/v4/inbox?page=1", "POST") as {
				entries: unknown[];
			};
			return z.array(fullConversationSchema).parse(body.entries);
		};
		const starred = inbox().find((entry) => entry.data.favorite);
		if (!starred)
			throw new Error("the demo inbox has no favorited conversation");
		const profileId = starred.data.participants[0]?.profileId;
		if (!profileId)
			throw new Error("the favorited conversation has no participant");

		route(`/v3/me/favorites/${profileId}`, "DELETE");

		const conversationAfter = inbox().find(
			(entry) =>
				entry.data.conversationId === starred.data.conversationId,
		);
		expect(conversationAfter?.data.favorite).toBe(false);
		const profileAfter = route(`/v7/profiles/${profileId}`, "GET") as {
			profiles: { isFavorite: boolean }[];
		};
		expect(profileAfter.profiles[0]?.isFavorite).toBe(false);

		route(`/v3/me/favorites/${profileId}`, "POST");
		expect(
			inbox().find(
				(entry) =>
					entry.data.conversationId === starred.data.conversationId,
			)?.data.favorite,
		).toBe(true);
	});

	it("lists hides out of the order they were hidden in, like Grindr", () => {
		const hiddenIds = [100901, 100902, 100903];
		const listedIds = () =>
			(
				route("/v1/hides") as { hides: { profileId: number }[] }
			).hides.map(({ profileId }) => profileId);

		for (const profileId of hiddenIds)
			route(`/v1/me/hides/${profileId}`, "POST");
		const listed = listedIds();
		for (const profileId of hiddenIds)
			route(`/v1/hides/${profileId}`, "DELETE");

		expect(listed.toSorted((a, b) => a - b)).toEqual(hiddenIds);
		expect(listed).not.toEqual(hiddenIds);
		expect(listed).not.toEqual(hiddenIds.toReversed());
		expect(listedIds()).toEqual([]);
	});

	it("keeps every conversation peer's profile favorite in agreement with its row", () => {
		const body = route("/v4/inbox?page=1", "POST") as {
			entries: unknown[];
		};
		const entries = z.array(fullConversationSchema).parse(body.entries);
		expect(entries.length).toBeGreaterThan(0);

		for (const entry of entries) {
			const profileId = entry.data.participants[0]?.profileId;
			const profile = (
				route(`/v7/profiles/${profileId}`, "GET") as {
					profiles: { isFavorite: boolean }[];
				}
			).profiles[0];
			expect(
				profile?.isFavorite,
				`profile ${profileId} vs its conversation row`,
			).toBe(entry.data.favorite);
		}
	});

	it("filters the inbox server-side when the body asks for favorites only", () => {
		const body = route("/v4/inbox?page=1", "POST", {
			favoritesOnly: true,
		}) as { entries: unknown[] };
		const entries = z.array(fullConversationSchema).parse(body.entries);

		expect(entries.length).toBeGreaterThan(0);
		expect(entries.every((entry) => entry.data.favorite)).toBe(true);
	});
});
