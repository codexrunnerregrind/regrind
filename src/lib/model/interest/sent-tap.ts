import z from "zod";

import { tapTypeOrNoneSchema } from "$lib/model/interest/taps";
import { unixTimestampMsSchema } from "$lib/model/types";
import {
	profileMaskedMinSchema,
	profileMinSchema,
} from "$lib/model/users/profiles";

/**
 * One tap we sent, as the API lists it: ids and timestamps only. Who the
 * profile is has to be looked up separately — see {@link SentTapProfile}.
 */
export const sentTapSchema = z.object({
	senderId: z.coerce.number().int().nonnegative(),
	receiverId: z.coerce.number().int().nonnegative(),
	tapType: tapTypeOrNoneSchema,
	sentOn: unixTimestampMsSchema,
	/** When they opened it. Null while it is still unread. */
	readOn: unixTimestampMsSchema.nullable(),
	deleted: z.boolean(),
});

export type SentTap = z.infer<typeof sentTapSchema>;

/** A sent tap with the recipient's profile filled in, as the list renders it. */
export const sentTapProfileSchema = z.object({
	...profileMaskedMinSchema.shape,
	...profileMinSchema.shape,
	tapType: sentTapSchema.shape.tapType,
	sentOn: sentTapSchema.shape.sentOn,
	readOn: sentTapSchema.shape.readOn,
});

export type SentTapProfile = z.infer<typeof sentTapProfileSchema>;
