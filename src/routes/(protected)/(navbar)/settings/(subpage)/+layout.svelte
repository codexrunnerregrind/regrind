<script lang="ts">
	import SettingsNavBar from "../SettingsNavBar.svelte";

	let { children }: import("./$types").LayoutProps = $props();
</script>

<SettingsNavBar />
<main class="screen-nav-host">
	<div class="h-full w-full overflow-y-auto overscroll-none">
		<div class="flex w-full px-4 pt-19 pb-nav-clear">
			<!-- No container gap: section headers and footers own their own vertical
			     rhythm so a group and its footnote stay visually attached. -->
			<div class="m-auto flex w-full max-w-120 flex-col pb-16">
				{@render children?.()}
			</div>
		</div>
	</div>
</main>
