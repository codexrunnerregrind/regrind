import z from "zod";

const storedTimestampSchema = z.coerce.number().int().nonnegative();

export function lastViewedMarker(prefix: string) {
	const keyFor = (profileId: number) => `${prefix}${profileId}`;

	return {
		load(profileId: number): number {
			if (typeof localStorage === "undefined") return 0;
			return (
				storedTimestampSchema.safeParse(
					localStorage.getItem(keyFor(profileId)),
				).data ?? 0
			);
		},

		save({ profileId, at }: { profileId: number; at: number }): void {
			if (typeof localStorage === "undefined") return;
			localStorage.setItem(keyFor(profileId), String(at));
		},

		/**
		 * Forget one account's marker. Scoped to a single profile because the
		 * markers of the other signed-in accounts have to survive: signing out
		 * of one account is not a reason to mark every other account's inbox as
		 * never-viewed.
		 */
		clearStored(profileId: number): void {
			if (typeof localStorage === "undefined") return;
			localStorage.removeItem(keyFor(profileId));
		},
	};
}
