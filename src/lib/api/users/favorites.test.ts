import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import {
	addFavoriteUser,
	getFavoriteNote,
	removeFavoriteUser,
	setFavoriteNote,
} from "$lib/api/users/favorites";

const assertOk = vi.fn();

// Enough of what `fetchRest` returns for these wrappers, parsing the body the
// same way the real response object does.
function restResponse(status: number, body: string) {
	return {
		status,
		assertOk,
		text: () => body,
		json: () => JSON.parse(body),
		jsonParsed: <T>(schema: { parse: (data: unknown) => T }) =>
			schema.parse(JSON.parse(body)),
	};
}

beforeEach(() => {
	assertOk.mockReset();
	fetchRestMock.mockReset();
	fetchRestMock.mockResolvedValue({ assertOk });
});

describe("favorites API wrappers", () => {
	it("adds favorites and asserts the response status", async () => {
		await addFavoriteUser({ profileId: 42 });

		expect(fetchRestMock).toHaveBeenCalledWith("/v3/me/favorites/42", {
			method: "POST",
		});
		expect(assertOk).toHaveBeenCalledOnce();
	});

	it("removes favorites and asserts the response status", async () => {
		await removeFavoriteUser({ profileId: 42 });

		expect(fetchRestMock).toHaveBeenCalledWith("/v3/me/favorites/42", {
			method: "DELETE",
		});
		expect(assertOk).toHaveBeenCalledOnce();
	});

	// The per-profile response is the note alone, even though the API docs
	// describe it as the shape the list returns. Parsing it with the list schema
	// threw, which silently lost every note read from a profile screen.
	it("reads a note whose response carries no counterparty id", async () => {
		fetchRestMock.mockResolvedValue(
			restResponse(200, '{"notes":"Ffff","phoneNumber":""}'),
		);

		await expect(getFavoriteNote({ profileId: 42 })).resolves.toEqual({
			notes: "Ffff",
			phoneNumber: "",
		});
	});

	it("reads a favorite with no note as no note rather than failing", async () => {
		fetchRestMock.mockResolvedValue(restResponse(404, ""));

		await expect(getFavoriteNote({ profileId: 42 })).resolves.toBeNull();
	});

	it("writes a note with the profile id in the path and the body", async () => {
		await setFavoriteNote({
			profileId: 42,
			note: { notes: "Met at the bar", phoneNumber: "912345678" },
		});

		expect(fetchRestMock).toHaveBeenCalledWith("/v1/favorites/notes/42", {
			method: "PUT",
			body: {
				counterpartyId: 42,
				notes: "Met at the bar",
				phoneNumber: "912345678",
			},
		});
		expect(assertOk).toHaveBeenCalledOnce();
	});
});
