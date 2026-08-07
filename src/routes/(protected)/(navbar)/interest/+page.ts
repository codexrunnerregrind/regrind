import { redirect } from "@sveltejs/kit";

import type { PageLoad } from "./$types";
import { getInterestTab } from "./interest-tab";

export const load: PageLoad = () => {
	// `/interest` is the tab bar's link; it always stands for whichever sub-tab
	// you were last on.
	redirect(303, getInterestTab());
};
