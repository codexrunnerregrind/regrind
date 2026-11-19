<script lang="ts">
	import PencilIcon from "phosphor-svelte/lib/PencilIcon";

	import { Button } from "#lib/components/ui/button/index.ts";
	import { t } from "#lib/i18n/index.ts";
</script>

<Button
	size="lg"
	href="/settings/profile"
	variant="default"
	aria-label={t("profile.topNav.editProfile")}
>
	<PencilIcon />
	{t("profile.topNav.editProfile")}
</Button>
