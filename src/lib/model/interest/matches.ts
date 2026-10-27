import z from "zod";

import { sexualPositionSchema } from "$lib/model/users/profiles";

export const matchesV1QuerySchema = z.object({
	limit: z.int().nonnegative().optional(),
	withProfileDetail: z.boolean().optional(),
	cursor: z.string().optional(),
});

export const matchesProfileSchema = z.object({
	age: z.int().nonnegative().nullable(),
	displayName: z.string().nullable(),
	distance: z.number().nonnegative().nullable(),
	height: z.number().nonnegative().nullable(),
	isOnPrep: z.boolean(),
	onlineUntil: z.int().nonnegative().nullable(),
	position: sexualPositionSchema.nullable(),
	profileId: z.int().nonnegative(),
	profileImageMediaHash: z.string().nullable(),
	tapped: z.boolean().nullable(),
	visitingStatus: z.boolean().nullable(),
	weight: z.number().nullable(),
});

export const matchesMatchSchema = z.object({
	isViewable: z.boolean(),
	lastInteraction: z.int().nonnegative(),
	matchId: z.string(),
	profile: matchesProfileSchema,
	// Open-ended: the documented values are not known to be exhaustive.
	source: z.string(),
});

export const matchesV1ResponseSchema = z.object({
	matches: z.array(matchesMatchSchema),
	nextCursor: z.string().nullable(),
	total: z.int().nonnegative(),
});

export type MatchesMatch = z.infer<typeof matchesMatchSchema>;
