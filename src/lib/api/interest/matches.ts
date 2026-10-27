import type z from "zod";

import { fetchRest } from "$lib/api/transport";
import {
	matchesV1QuerySchema,
	matchesV1ResponseSchema,
} from "$lib/model/interest/matches";
import { urlSearchParamsCodec } from "$lib/util/url-search-params";

export async function getMatchesV1(
	query: z.infer<typeof matchesV1QuerySchema>,
) {
	return await fetchRest(
		"/v1/matches?" +
			new URLSearchParams(
				urlSearchParamsCodec(matchesV1QuerySchema).encode(query),
			).toString(),
	).then((res) => res.jsonParsed(matchesV1ResponseSchema));
}
