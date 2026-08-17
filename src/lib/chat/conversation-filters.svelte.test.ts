import { describe, expect, it } from "vitest";

import {
	ConversationFilters,
	inboxFilterRequest,
} from "./conversation-filters.svelte";
import { conversation } from "./conversations-test-helpers";

const plain = conversation("a:1", 1000);
const favorited = conversation("b:2", 1000, { favorite: true });
const unread = conversation("c:3", 1000, { unreadCount: 2 });
const online = conversation("f:6", 1000, {
	onlineUntil: Date.now() + 10 * 60 * 1000,
});
const offline = conversation("g:7", 1000, { onlineUntil: Date.now() - 1000 });
const mutedUnread = conversation("d:4", 1000, { unreadCount: 2, muted: true });

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

	it("reports whether set() changed the active filters", () => {
		const filters = new ConversationFilters();

		expect(filters.set(["favorites"])).toBe(true);
		expect(filters.set(["favorites"])).toBe(false);
		expect(filters.set([])).toBe(true);
		expect(filters.set([])).toBe(false);
	});
});

describe("inboxFilterRequest", () => {
	it("asks for no filtering at all while none is active", () => {
		expect(inboxFilterRequest([])).toBeNull();
	});

	it("maps each active filter onto its request flag", () => {
		expect(inboxFilterRequest(["unread"])).toMatchObject({
			unreadOnly: true,
			favoritesOnly: false,
		});
		expect(inboxFilterRequest(["favorites"])).toMatchObject({
			unreadOnly: false,
			favoritesOnly: true,
		});
		expect(inboxFilterRequest(["online"])).toMatchObject({
			onlineNowOnly: true,
			unreadOnly: false,
		});
		expect(inboxFilterRequest(["unread", "favorites"])).toMatchObject({
			unreadOnly: true,
			favoritesOnly: true,
			onlineNowOnly: false,
		});
	});
});
