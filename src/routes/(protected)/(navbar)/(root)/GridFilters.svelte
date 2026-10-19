<script lang="ts">
	import { untrack } from "svelte";
	import type { Attachment } from "svelte/attachments";

	import { edgeGap } from "$lib/components/feedback/refresh/scroll-geometry";
	import AgeFilter from "$lib/components/filters/age/AgeFilterField.svelte";
	import FilterRowGroup from "$lib/components/filters/FilterRowGroup.svelte";
	import FilterSection from "$lib/components/filters/FilterSection.svelte";
	import FilterSwitch from "$lib/components/filters/FilterSwitch.svelte";
	import GendersFilter from "$lib/components/filters/GendersFilter.svelte";
	import HeightFilter from "$lib/components/filters/HeightFilter.svelte";
	import { optionFilters } from "$lib/components/filters/option-filters";
	import OptionFilter from "$lib/components/filters/OptionFilter.svelte";
	import PhotosFilter from "$lib/components/filters/PhotosFilter.svelte";
	import PositionFilter from "$lib/components/filters/position/PositionFilterField.svelte";
	import TagsFilter from "$lib/components/filters/TagsFilter.svelte";
	import UsernameFilter from "$lib/components/filters/UsernameFilter.svelte";
	import WeightFilter from "$lib/components/filters/WeightFilter.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import * as Sheet from "$lib/components/ui/sheet";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import {
		countActiveFilters,
		defaultFilters,
	} from "$lib/model/browse/grid/filters";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { deepEqual } from "$lib/util/deep-equal";

	let { open = $bindable() }: { open: boolean } = $props();

	let filters = $state(gridState.filters.snapshot());

	$effect(() => {
		if (open) {
			filters = untrack(() => gridState.filters.snapshot());
		}
	});

	const activeCount = $derived(countActiveFilters(filters));

	// Nothing here reaches the grid until Apply, so a stray tap on the close
	// button or a back gesture would silently throw the edits away.
	const dirty = $derived(!deepEqual(filters, gridState.filters.snapshot()));
	let confirmDiscard = $state(false);

	function apply() {
		gridState.filters.set(filters);
		open = false;
	}

	function requestClose() {
		if (dirty) {
			confirmDiscard = true;
		} else {
			open = false;
		}
	}

	let atTop = $state(true);
	let atBottom = $state(false);

	const trackScrollEdges: Attachment<HTMLElement> = (scroller) => {
		const classify = () => {
			const { scrollTop, scrollHeight, clientHeight } = scroller;
			atTop = scrollTop <= 0;
			atBottom = edgeGap(scrollHeight - clientHeight - scrollTop) <= 0;
		};
		classify();
		const resizes = new ResizeObserver(classify);
		resizes.observe(scroller);
		for (const column of scroller.children) resizes.observe(column);
		scroller.addEventListener("scroll", classify, { passive: true });
		return () => {
			resizes.disconnect();
			scroller.removeEventListener("scroll", classify);
			atTop = true;
			atBottom = false;
		};
	};

	dismissOnBackGesture({ active: () => open, dismiss: requestClose });
</script>

{#snippet col1()}
	<FilterRowGroup>
		<FilterSwitch id="favorite" bind:checked={filters.isFavorite}>
			Favorites only
		</FilterSwitch>
		<FilterSwitch id="online" bind:checked={filters.isOnline}>
			Online now
		</FilterSwitch>
		<FilterSwitch id="right-now" bind:checked={filters.isRightNow}>
			Right now
		</FilterSwitch>
		<FilterSwitch id="fresh" bind:checked={filters.isFresh}>
			Fresh
		</FilterSwitch>
		<FilterSwitch
			id="havent-chatted-today"
			bind:checked={filters.haventChattedTodayEnabled}
		>
			Haven't chatted today
		</FilterSwitch>
	</FilterRowGroup>
	<AgeFilter bind:checked={filters.ageEnabled} bind:value={filters.age} />
	<FilterSection title="Basics">
		<FilterRowGroup>
			<GendersFilter
				bind:checked={filters.genderEnabled}
				bind:value={filters.genders}
			/>
			<PositionFilter
				bind:checked={filters.positionEnabled}
				bind:value={filters.positions}
			/>
			<PhotosFilter
				bind:checked={filters.photosEnabled}
				bind:value={filters.photos}
			/>
		</FilterRowGroup>
	</FilterSection>
{/snippet}
{#snippet col2()}
	<FilterSection title="Them">
		<FilterRowGroup>
			<TagsFilter
				bind:checked={filters.tagsEnabled}
				bind:value={filters.tags}
			/>
			<OptionFilter
				filter={optionFilters.tribes}
				bind:checked={filters.tribesEnabled}
				bind:value={filters.tribes}
			/>
			<OptionFilter
				filter={optionFilters.tribesImInto}
				bind:checked={filters.tribesImIntoEnabled}
				bind:value={filters.tribesImInto}
			/>
			<OptionFilter
				filter={optionFilters.bodyTypes}
				bind:checked={filters.bodyTypesEnabled}
				bind:value={filters.bodyTypes}
			/>
			<HeightFilter
				bind:checked={filters.heightEnabled}
				bind:value={filters.height}
			/>
			<WeightFilter
				bind:checked={filters.weightEnabled}
				bind:value={filters.weight}
			/>
			<OptionFilter
				filter={optionFilters.relationshipStatuses}
				bind:checked={filters.relationshipStatusesEnabled}
				bind:value={filters.relationshipStatuses}
			/>
			<UsernameFilter
				bind:checked={filters.usernameEnabled}
				bind:value={filters.username}
			/>
		</FilterRowGroup>
	</FilterSection>
{/snippet}
{#snippet col3()}
	<FilterSection title="Meeting">
		<FilterRowGroup>
			<OptionFilter
				filter={optionFilters.lookingFor}
				bind:checked={filters.lookingForEnabled}
				bind:value={filters.lookingFor}
			/>
			<OptionFilter
				filter={optionFilters.meetAt}
				bind:checked={filters.meetAtEnabled}
				bind:value={filters.meetAt}
			/>
		</FilterRowGroup>
	</FilterSection>
	<FilterSection title="Health & NSFW">
		<FilterRowGroup>
			<OptionFilter
				filter={optionFilters.acceptNSFWPics}
				bind:checked={filters.acceptNSFWPicsEnabled}
				bind:value={filters.acceptNSFWPics}
			/>
			<OptionFilter
				filter={optionFilters.healthPractices}
				bind:checked={filters.healthPracticesEnabled}
				bind:value={filters.healthPractices}
			/>
		</FilterRowGroup>
	</FilterSection>
{/snippet}
<Sheet.Root
	bind:open={
		() => open,
		(v: boolean) => {
			if (v) {
				open = true;
			} else {
				requestClose();
			}
		}
	}
>
	<Sheet.Content
		side="bottom"
		class="mt-(--safe-area-top) mb-(--safe-area-bottom) max-h-screen-safe"
		showCloseButton
	>
		<Sheet.Header
			class={[
				"gap-0.5 border border-x-0 border-t-0 border-transparent p-4 transition-colors",
				{ "border-muted": !atTop },
			]}
		>
			<!-- Reset sits on the title's line, tucked in beside the close
			     button the sheet draws at the top right. -->
			<div class="flex min-w-0 items-center justify-between gap-3 pe-11">
				<Sheet.Title>Filters</Sheet.Title>
				{#if activeCount > 0}
					<Button
						variant="ghost"
						size="sm"
						class="-me-2 text-primary"
						onclick={() => (filters = { ...defaultFilters })}
					>
						Reset
					</Button>
				{/if}
			</div>
			<!-- The count is the one thing you cannot see from the top of a
			     sheet this long: how much is still narrowing the grid further
			     down. -->
			<span class="text-xs text-muted-foreground">
				{activeCount === 0
					? "No filters active"
					: `${activeCount} active`}
			</span>
		</Sheet.Header>
		<div
			class="flex max-h-full min-h-0 w-full flex-1 shrink gap-4 overflow-auto px-4 py-1 pb-4 *:flex-1 *:flex-col *:gap-5 **:break-inside-avoid max-lg:flex-col lg:gap-12"
			data-slot="grid-filters-scroller"
			{@attach trackScrollEdges}
		>
			<div class="flex max-w-full">
				{@render col1()}
			</div>
			<div class="flex max-w-full">
				{@render col2()}
			</div>
			<div class="flex max-w-full">
				{@render col3()}
			</div>
		</div>
		<Sheet.Footer
			class={[
				"border border-x-0 border-b-0 border-transparent p-4 transition-colors sm:items-end",
				{ "border-muted": !atBottom },
			]}
		>
			<Button type="submit" onclick={apply}>Apply</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>

<AlertDialog.Root bind:open={confirmDiscard}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Discard filter changes?</AlertDialog.Title>
			<AlertDialog.Description>
				You changed the filters but haven't applied them yet. Closing
				now leaves the grid as it was.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Keep editing</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				onclick={() => {
					confirmDiscard = false;
					open = false;
				}}
			>
				Discard
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
