<script lang="ts">
	import SectionFooter from "$lib/components/settings/SectionFooter.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import AppIconSetting from "./AppIconSetting.svelte";
</script>

<SettingsGroup divider="none">
	<AppIconSetting />
</SettingsGroup>
<SectionFooter>
	A discreet icon hides what the app is on your home screen.
</SectionFooter>
