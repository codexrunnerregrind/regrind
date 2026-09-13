import type { Gender } from "$lib/model/users/genders";

type GenderChip = Pick<
	Gender,
	"genderId" | "displayGroup" | "excludeOnFilterSelection"
>;

export function isGenderChipShown({
	gender,
	selected,
	expanded,
}: {
	gender: GenderChip;
	selected: number[];
	expanded: boolean;
}): boolean {
	if (selected.includes(gender.genderId)) return true;
	const excludedBy = gender.excludeOnFilterSelection ?? [];
	if (selected.some((id) => excludedBy.includes(id))) return false;
	return expanded || gender.displayGroup === 1;
}

export function selectGenders({
	genders,
	previous,
	next,
}: {
	genders: GenderChip[];
	previous: number[];
	next: number[];
}): number[] {
	const added = next.filter((id) => !previous.includes(id));
	return next.filter((id) => {
		if (added.includes(id)) return true;
		const excludedBy =
			genders.find((gender) => gender.genderId === id)
				?.excludeOnFilterSelection ?? [];
		return !excludedBy.some((excluded) => added.includes(excluded));
	});
}
