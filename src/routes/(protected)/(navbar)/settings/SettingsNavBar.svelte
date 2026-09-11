<script lang="ts">
	import { page } from "$app/state";
	import { ArrowLeftIcon } from "phosphor-svelte";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";

	const base = "/(protected)/(navbar)/settings/(subpage)";
	const routes: Record<string, { title: string; back: string }> = {
		[`${base}/account`]: { title: "Account Settings", back: "/settings" },
		[`${base}/account/blocked`]: {
			title: "Blocked users",
			back: "/settings/account",
		},
		[`${base}/account/privacy`]: {
			title: "Privacy",
			back: "/settings/account",
		},
		[`${base}/account/hidden`]: {
			title: "Hidden users",
			back: "/settings/account",
		},
		[`${base}/app`]: { title: "App Settings", back: "/settings" },
		[`${base}/app/credits`]: {
			title: "Credits & Licenses",
			back: "/settings/app",
		},
		[`${base}/app/favorites/export`]: {
			title: "Export favorites",
			back: "/settings/app",
		},
		[`${base}/app/favorites/import`]: {
			title: "Import favorites",
			back: "/settings/app",
		},
		[`${base}/appearance`]: { title: "Appearance", back: "/settings" },
		[`${base}/profile`]: { title: "Edit Profile", back: "/settings" },
	};

	const current = $derived(
		(page.route.id && routes[page.route.id]) ?? {
			title: "",
			back: "/settings",
		},
	);
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="fixed top-0 left-0 z-20 h-[calc(4.75rem+var(--safe-area-top))] w-full shrink-0"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex items-center h-full pe-5.5 pt-(--safe-area-top)"
	tag="nav"
>
	<a
		href={current.back}
		aria-label="Back"
		class="flex h-full w-19 shrink-0 items-center justify-center"
	>
		<ArrowLeftIcon size={32} />
	</a>
	<span class="detail-title min-w-0 truncate">
		{current.title}
	</span>
</ProgressiveBlur>
