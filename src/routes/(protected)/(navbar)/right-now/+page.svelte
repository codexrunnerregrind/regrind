<script lang="ts">
	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import { tabShellShowing } from "#lib/components/tab-shell/tab-shell-state.svelte.ts";
	import { t } from "#lib/i18n/index.ts";
	import RightNowScreen from "./RightNowScreen.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<PageTitle page={t("shell.navBar.tabs.rightNow")} />

<!-- On a phone the tab shell shows this screen as one of its panes. -->
{#if !tabShellShowing()}
	<RightNowScreen ourProfileId={data.ourProfileId} />
{/if}
