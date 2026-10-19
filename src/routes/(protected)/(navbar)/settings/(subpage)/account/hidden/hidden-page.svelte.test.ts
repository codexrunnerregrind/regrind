import { cleanup, render } from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";

const { hides, profileList } = vi.hoisted(() => ({
	hides: {
		getHiddenUserIdsNewestFirst: vi.fn(() => Promise.resolve([3, 1, 2])),
		getHiddenUsers: vi.fn(() =>
			Promise.resolve([
				{ profileId: 1 },
				{ profileId: 2 },
				{ profileId: 3 },
			]),
		),
		hideUser: vi.fn(() => Promise.resolve()),
		unhideUser: vi.fn(() => Promise.resolve()),
	},
	profileList: {
		props: null as {
			loadIds: () => Promise<number[]>;
			lift: (args: { profileId: number }) => Promise<void>;
		} | null,
	},
}));

vi.mock("$lib/api/browse/hides", () => hides);
vi.mock("$lib/components/profile-list/ProfileList.svelte", () => ({
	default: (_anchor: unknown, props: typeof profileList.props) => {
		profileList.props = props;
	},
}));

import HiddenPage from "./+page.svelte";

function mountedList() {
	render(HiddenPage);
	if (!profileList.props) throw new Error("the profile list did not mount");
	return profileList.props;
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	profileList.props = null;
});

it("lists the hidden profiles in the order the hides module ranks them", async () => {
	expect(await mountedList().loadIds()).toEqual([3, 1, 2]);
	expect(hides.getHiddenUsers).not.toHaveBeenCalled();
});

it("unhides from the list", async () => {
	await mountedList().lift({ profileId: 4 });

	expect(hides.unhideUser).toHaveBeenCalledExactlyOnceWith({ profileId: 4 });
});
