import z from "zod";

import { filterPositionSchema, filterHostingSchema, filterRightNowSortSchema } from "$lib/components/filters/filters";

export const rightNowV4QuerySchema = z.object({
    sort: filterRightNowSortSchema,
    hosting: filterHostingSchema.optional(),
    sexualPositions: filterPositionSchema.optional(),
    ageMin: z.int().nonnegative().optional(),
    ageMax: z.int().nonnegative().optional(),
});