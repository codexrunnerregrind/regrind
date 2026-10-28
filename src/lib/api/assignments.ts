import type z from "zod";

import { fetchRest } from "$lib/api/transport";
import {
	assignmentsV3QuerySchema,
	assignmentsV3ResponseSchema,
} from "$lib/model/assignments";
import { urlSearchParamsCodec } from "$lib/util/url-search-params";

export async function getAssignmentsV3(
	query: z.infer<typeof assignmentsV3QuerySchema>,
) {
	return await fetchRest(
		"/v3/assignment?" +
			new URLSearchParams(
				urlSearchParamsCodec(assignmentsV3QuerySchema).encode(query),
			).toString(),
	).then((res) => res.jsonParsed(assignmentsV3ResponseSchema));
}
