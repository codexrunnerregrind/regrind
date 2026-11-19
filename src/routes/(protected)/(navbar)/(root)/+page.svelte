<script lang="ts">
	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import { tabShellShowing } from "#lib/components/tab-shell/tab-shell-state.svelte.ts";
	import { t } from "#lib/i18n/index.ts";
	import BrowseScreen from "./BrowseScreen.svelte";
</script>

<PageTitle page={t("shell.navBar.tabs.browse")} />

<!-- On a phone the tab shell shows this screen as one of its panes. -->
{#if !tabShellShowing()}
	<BrowseScreen active />
{/if}
