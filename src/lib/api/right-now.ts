import z from "zod";

import { fetchRest } from "$lib/api";
import { rightNowV4QuerySchema } from "$lib/model/right-now/feed/query/v4";
import { RightNowFeedResponseSchema } from "$lib/model/right-now/feed/response/v4";
import { urlSearchParamsCodec } from "$lib/util/utils";

export async function getRightNowFeedV4(
	query: z.infer<typeof rightNowV4QuerySchema>,
) {
	return await fetchRest(
		"/v4/rightnow/feed?" +
			new URLSearchParams(
				urlSearchParamsCodec(rightNowV4QuerySchema).encode(query),
			).toString(),
	).then((res) => res.jsonParsed(RightNowFeedResponseSchema));
}
