<script lang="ts">
	import CalendarBlankIcon from "phosphor-svelte/lib/CalendarBlankIcon";

	import { estimateAccountCreation } from "$lib/model/users/account-age";
	import ProfileField from "./ProfileField.svelte";
	import ProfileValueLabel from "./ProfileValueLabel.svelte";

	let { profileId }: { profileId: number } = $props();

	const created = $derived(
		estimateAccountCreation(profileId).toLocaleDateString(undefined, {
			month: "short",
			year: "numeric",
		}),
	);
</script>

<ProfileField>
	<CalendarBlankIcon class="shrink-0" />
	<ProfileValueLabel label="Created">~{created}</ProfileValueLabel>
</ProfileField>
