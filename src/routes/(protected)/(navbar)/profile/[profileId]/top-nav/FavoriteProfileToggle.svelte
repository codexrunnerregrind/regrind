<script lang="ts">
	import StarIcon from "phosphor-svelte/lib/StarIcon";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import { forgetFavoriteNote } from "#lib/api/users/favorite-notes-state.svelte.ts";
	import {
		addFavoriteUser,
		removeFavoriteUser,
	} from "#lib/api/users/favorites.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { t } from "#lib/i18n/index.ts";

	let {
		profileId,
		isFavorite,
		onFavorite,
	}: {
		profileId: number;
		isFavorite: boolean;
		onFavorite: (isFavorite: boolean) => void;
	} = $props();

	let submitting = $state(false);
</script>

<Button
	size="icon-lg"
	onclick={async () => {
		if (submitting) return;
		submitting = true;

		try {
			if (isFavorite) {
				await removeFavoriteUser({ profileId });
				onFavorite(false);
				// Unfavoriting drops the note server-side, so the cached copy would
				// otherwise reappear if the profile is favorited again.
				forgetFavoriteNote(profileId);
			} else {
				await addFavoriteUser({ profileId });
				onFavorite(true);
			}
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: isFavorite
					? t("profile.topNav.favorite.errors.removeFailed")
					: t("profile.topNav.favorite.errors.addFailed"),
				error,
			});
		} finally {
			submitting = false;
		}
	}}
	variant="secondary"
	aria-checked={isFavorite}
	role="switch"
	aria-label={isFavorite
		? t("profile.topNav.favorite.a11y.remove")
		: t("profile.topNav.favorite.a11y.add")}
	class="size-12"
	disabled={submitting}
>
	<StarIcon
		weight={isFavorite ? "fill" : "thin"}
		class={["size-6", { "text-yellow-400": isFavorite }]}
	/>
</Button>
