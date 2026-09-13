import { describe, expect, it } from "vitest";

import { asUpdateError, capabilitySchema, readinessSchema } from "./types";

const foreignTarget = { reason: "foreignTarget" };

describe("a foreign-signed install target", () => {
	it("parses as an unsupported capability", () => {
		const payload = { state: "unsupported", detail: foreignTarget };

		expect(capabilitySchema.safeParse(payload).data).toEqual(payload);
	});

	it("parses as an unsupported readiness", () => {
		const payload = { state: "unsupported", detail: foreignTarget };

		expect(readinessSchema.safeParse(payload).data).toEqual(payload);
	});

	it("parses as a refused install", () => {
		expect(
			asUpdateError({ kind: "unsupported", detail: foreignTarget }),
		).toEqual({ kind: "unsupported", detail: foreignTarget });
	});
});
