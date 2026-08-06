import z from "zod";

import {
	filterHostingSchema,
	filterPositionSchema,
	filterRightNowSortSchema,
} from "$lib/model/browse/grid/filters";

export const rightNowV4QuerySchema = z.object({
	sort: filterRightNowSortSchema,
	hosting: filterHostingSchema.optional(),
	sexualPositions: filterPositionSchema.optional(),
	ageMin: z.int().nonnegative().optional(),
	ageMax: z.int().nonnegative().optional(),
});
