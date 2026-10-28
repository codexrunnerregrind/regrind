<script lang="ts">
	import FlagIcon from "phosphor-svelte/lib/FlagIcon";
	import FlaskIcon from "phosphor-svelte/lib/FlaskIcon";

	import { Button } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";

	let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Drawer.Root bind:open>
	<Drawer.Content class="mx-auto max-w-160">
		<Drawer.Header>
			<Drawer.Title class="text-left"
				>What Grindr Experiments are</Drawer.Title
			>
		</Drawer.Header>
		<div class="flex flex-col gap-4.5 px-4">
			<p class="text-sm/[1.45] text-muted-foreground">
				Grindr (like other applications) is using a mix of feature flags
				and experiment flags, internally referred to as assignments, in
				order to make the app behave in specific ways.
			</p>

			<p class="text-sm/[1.45] text-muted-foreground">
				Most assignments are used in order to drive the app behaviour,
				what the users sees and how. Some are used in order to limit
				access API access (mostly used for brand new features).
			</p>

			<div class="flex items-center gap-3.5">
				<span
					class="flex size-8.5 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"
				>
					<FlagIcon size={20} weight="fill" />
				</span>
				<p class="text-sm/[1.45] text-muted-foreground">
					Indicates a feature flag
				</p>
			</div>

			<div class="flex items-center gap-3.5">
				<span
					class="flex size-8.5 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"
				>
					<FlaskIcon size={20} weight="fill" />
				</span>
				<p class="text-sm/[1.45] text-muted-foreground">
					Indicates an experiment
				</p>
			</div>
		</div>
		<Drawer.Footer class="pt-6.5">
			<Button variant="secondary" onclick={() => (open = false)}
				>Got it</Button
			>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
