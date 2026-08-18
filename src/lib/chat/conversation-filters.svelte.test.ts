import { describe, expect, it } from "vitest";

import { FilterPosition } from "$lib/model/browse/grid/filters";
import { SexualPosition } from "$lib/model/users/profiles";
import {
	ConversationFilters,
	type ConversationFilterSelection,
	inboxFilterRequest,
} from "./conversation-filters.svelte";
import { conversation, PEER_ID } from "./conversations-test-helpers";

/** The request builder takes a whole selection, so tests name only what differs. */
function selection(
	overrides: Partial<ConversationFilterSelection> = {},
): ConversationFilterSelection {
	return { active: [], distanceMetres: null, positions: [], ...overrides };
}

function participant(overrides: {
	distanceMetres?: number;
	position?: number;
}) {
	return {
		participants: [
			{
				profileId: PEER_ID,
				primaryMediaHash: null,
				lastOnline: null,
				onlineUntil: null,
				distanceMetres: null,
				position: null,
				isInAList: false,
				hasDatingPotential: false,
				...overrides,
			},
		],
	} as never;
}

const plain = conversation("a:1", 1000);
const favorited = conversation("b:2", 1000, { favorite: true });
const unread = conversation("c:3", 1000, { unreadCount: 2 });
const online = conversation("f:6", 1000, {
	onlineUntil: Date.now() + 10 * 60 * 1000,
});
const offline = conversation("g:7", 1000, { onlineUntil: Date.now() - 1000 });
const mutedUnread = conversation("d:4", 1000, { unreadCount: 2, muted: true });
const near = conversation("h:8", 1000, participant({ distanceMetres: 1500 }));
const far = conversation("i:9", 1000, participant({ distanceMetres: 40_000 }));
const top = conversation(
	"j:10",
	1000,
	participant({ position: SexualPosition.Top }),
);
const bottom = conversation(
	"k:11",
	1000,
	participant({ position: SexualPosition.Bottom }),
);

describe("ConversationFilters", () => {
	it("passes everything through while no filter is on", () => {
		const filters = new ConversationFilters();

		expect(filters.active).toEqual([]);
		expect(filters.matches(plain)).toBe(true);
		expect(filters.matches(favorited)).toBe(true);
	});

	it("keeps only favorites once the favorites filter is on", () => {
		const filters = new ConversationFilters();
		filters.active = ["favorites"];

		expect(filters.matches(plain)).toBe(false);
		expect(filters.matches(favorited)).toBe(true);
	});

	it("keeps only unread conversations once the unread filter is on", () => {
		const filters = new ConversationFilters();
		filters.active = ["unread"];

		expect(filters.matches(plain)).toBe(false);
		expect(filters.matches(unread)).toBe(true);
	});

	it("counts a muted conversation as unread — muting is not reading", () => {
		const filters = new ConversationFilters();
		filters.active = ["unread"];

		expect(filters.matches(mutedUnread)).toBe(true);
	});

	it("keeps only conversations still online once the online filter is on", () => {
		const filters = new ConversationFilters();
		filters.active = ["online"];

		expect(filters.matches(online)).toBe(true);
		expect(filters.matches(offline)).toBe(false);
		expect(filters.matches(plain)).toBe(false);
	});

	it("requires every active filter to match, not just one", () => {
		const filters = new ConversationFilters();
		filters.active = ["unread", "favorites"];

		expect(filters.matches(unread)).toBe(false);
		expect(filters.matches(favorited)).toBe(false);
		expect(
			filters.matches(
				conversation("e:5", 1000, { unreadCount: 1, favorite: true }),
			),
		).toBe(true);
	});

	it("passes everything through again once the filter is cleared", () => {
		const filters = new ConversationFilters();
		filters.active = ["favorites"];
		filters.active = [];

		expect(filters.matches(plain)).toBe(true);
	});

	it("keeps only conversations inside the distance ceiling", () => {
		const filters = new ConversationFilters();
		filters.distanceMetres = 5000;

		expect(filters.matches(near)).toBe(true);
		expect(filters.matches(far)).toBe(false);
	});

	it("drops a conversation with no distance while a ceiling is set", () => {
		const filters = new ConversationFilters();
		filters.distanceMetres = 5000;

		expect(filters.matches(plain)).toBe(false);
	});

	it("keeps only the positions picked", () => {
		const filters = new ConversationFilters();
		filters.positions = [SexualPosition.Top];

		expect(filters.matches(top)).toBe(true);
		expect(filters.matches(bottom)).toBe(false);
	});

	it('matches an unpublished position against "not specified"', () => {
		const filters = new ConversationFilters();
		filters.positions = [FilterPosition.NotSpecified];

		expect(filters.matches(plain)).toBe(true);
		expect(filters.matches(top)).toBe(false);
	});

	it("reports whether set() changed the active filters", () => {
		const filters = new ConversationFilters();

		expect(filters.set({ active: ["favorites"] })).toBe(true);
		expect(filters.set({ active: ["favorites"] })).toBe(false);
		expect(filters.set({ active: [] })).toBe(true);
		expect(filters.set({ active: [] })).toBe(false);
		expect(filters.set({ distanceMetres: 5000 })).toBe(true);
		expect(filters.set({ distanceMetres: 5000 })).toBe(false);
		expect(filters.set({ positions: [SexualPosition.Top] })).toBe(true);
		expect(filters.set({ positions: [SexualPosition.Top] })).toBe(false);
	});
});

describe("inboxFilterRequest", () => {
	it("asks for no filtering at all while none is active", () => {
		expect(inboxFilterRequest(selection())).toBeNull();
	});

	it("maps each active filter onto its request flag", () => {
		expect(
			inboxFilterRequest(selection({ active: ["unread"] })),
		).toMatchObject({ unreadOnly: true, favoritesOnly: false });
		expect(
			inboxFilterRequest(selection({ active: ["favorites"] })),
		).toMatchObject({ unreadOnly: false, favoritesOnly: true });
		expect(
			inboxFilterRequest(selection({ active: ["online"] })),
		).toMatchObject({ onlineNowOnly: true, unreadOnly: false });
		expect(
			inboxFilterRequest(selection({ active: ["unread", "favorites"] })),
		).toMatchObject({
			unreadOnly: true,
			favoritesOnly: true,
			onlineNowOnly: false,
		});
	});

	it("asks for a distance ceiling and positions once those are set", () => {
		expect(
			inboxFilterRequest(
				selection({
					distanceMetres: 5000,
					positions: [SexualPosition.Top],
				}),
			),
		).toMatchObject({
			distanceMeters: 5000,
			positions: [SexualPosition.Top],
			unreadOnly: false,
		});
	});
});
