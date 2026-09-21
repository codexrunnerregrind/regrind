<script lang="ts">
	import { PencilIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
</script>

<Button
	size="lg"
	href="/settings/profile"
	variant="default"
	aria-label="Edit profile"
>
	<PencilIcon />
	Edit profile
</Button>
