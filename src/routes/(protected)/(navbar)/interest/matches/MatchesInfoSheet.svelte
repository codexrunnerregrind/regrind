<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import MatchReasonIcon from "./MatchReasonIcon.svelte";

	let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Drawer.Root bind:open>
	<Drawer.Content class="mx-auto max-w-160">
		<Drawer.Header>
			<Drawer.Title class="text-left">How Best matches works</Drawer.Title
			>
		</Drawer.Header>
		<div class="flex flex-col gap-4.5 px-4">
			<div class="flex items-center gap-3.5">
				<span
					class="flex size-8.5 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"
				>
					<MatchReasonIcon kind="mutual" class="size-4.25" />
				</span>
				<p class="text-sm/[1.45] text-muted-foreground">
					We look at interactions between you and others, then pick
					people who seem like a good fit.
				</p>
			</div>
			<div class="flex items-center gap-3.5">
				<span
					class="flex size-8.5 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"
				>
					<svg
						viewBox="0 0 20 20"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="size-4.25"
						aria-hidden="true"
					>
						<path
							d="M16 7.5A6.5 6.5 0 0 0 4.4 6M4 12.5A6.5 6.5 0 0 0 15.6 14"
						/>
						<path d="M4.2 2.8V6h3.2M15.8 17.2V14h-3.2" />
					</svg>
				</span>
				<p class="text-sm/[1.45] text-muted-foreground">
					Your matches refresh daily as new interactions come in.
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
