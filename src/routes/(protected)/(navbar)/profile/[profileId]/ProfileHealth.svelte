<script lang="ts">
	import HeartbeatIcon from "phosphor-svelte/lib/HeartbeatIcon";
	import SyringeIcon from "phosphor-svelte/lib/SyringeIcon";

	import {
		healthPracticeLabels,
		hivStatusLabels,
		type Profile,
		vaccines as vaccineLabels,
	} from "$lib/model/users/profiles";
	import HivStatusIcon from "./fields/HivStatusIcon.svelte";
	import LastTested from "./fields/LastTested.svelte";
	import LookupField from "./fields/LookupField.svelte";

	let { profile }: { profile: Profile } = $props();

	const { hivStatus, lastTestedDate, vaccines, sexualHealth } =
		$derived(profile);
</script>

{#if hivStatus !== null || lastTestedDate !== null || (vaccines && vaccines.length > 0) || (sexualHealth && sexualHealth.length > 0)}
	<div class="mt-5.5 flex flex-col gap-2.75">
		<span class="section-label">Health</span>
		<LookupField
			icon={HivStatusIcon}
			label="HIV Status"
			value={hivStatus}
			options={hivStatusLabels}
		/>
		<LastTested {lastTestedDate} />
		<LookupField
			icon={SyringeIcon}
			label="Vaccinated for"
			value={vaccines}
			options={vaccineLabels}
		/>
		<LookupField
			icon={HeartbeatIcon}
			label="Health Practices"
			value={sexualHealth}
			options={healthPracticeLabels}
		/>
	</div>
{/if}
