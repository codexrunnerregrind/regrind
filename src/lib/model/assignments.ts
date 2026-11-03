import z from "zod";

import { geohashSchema } from "$lib/model/geohash";

export const assignmentsV3QuerySchema = z.object({ geohash: geohashSchema });

export const assignmentTypeSchema = z.enum(["FEATURE_FLAG", "EXPERIMENT"]);

export const assignmentSchema = z.object({
	key: z.string(),
	value: z.string(),
	payload: z.unknown(),
	type: assignmentTypeSchema,
});

export const assignmentsV3ResponseSchema = z.object({
	assignments: z.array(assignmentSchema),
});

export type Assignment = z.infer<typeof assignmentSchema>;
