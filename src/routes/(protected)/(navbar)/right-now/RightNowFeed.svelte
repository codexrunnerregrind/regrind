<script lang="ts">
	import { afterNavigate, beforeNavigate } from "$app/navigation";

    import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
    import { rightNowState } from "$lib/right-now/right-now-state.svelte"
    import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
    import * as Avatar from "$lib/components/ui/avatar";
    import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
    import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
    import { ClockIcon, NavigationArrowIcon, HouseIcon, ChatIcon } from "phosphor-svelte";

    let {
		ourProfileId,
	}: {
		ourProfileId: number;
	} = $props();

    $effect.pre(() => {
		rightNowState.load();
	});

    export function refresh() {
		rightNowState.refresh();
	}

	beforeNavigate(() => {
		rightNowState.scrollY = window.scrollY;
	});

	afterNavigate((navigation) => {
		if (navigation.type === "popstate") return;
		if (!rightNowState.loading) {
			window.scrollTo({ top: rightNowState.scrollY, behavior: "instant" });
		}
	});

    let scrolled = $state(false);
	$effect(() => {
		if (!scrolled && !rightNowState.loading) {
			scrolled = true;
			window.scrollTo({ top: rightNowState.scrollY, behavior: "instant" });
		}
	});
</script>

<div class="px-8 flex flex-col gap-6 max-w-5xl">
    {#if rightNowState.loading}
        <div>TODO: Loading SKeleton</div>
	{:else if rightNowState.error}
		<div class="col-span-full flex p-4">
			<ApiErrorDisplay
				error={rightNowState.error}
				onRetry={() => rightNowState.refresh()}
				class="m-auto"
			/>
		</div>
    {:else}
        {#each rightNowState.posts as post}
            <div class="flex w-full gap-4 text-gray-400">
                <a href="/profile/{post.profileId}">
                    <Avatar.Root class="size-20">
                        <UserAvatar
                            mediaHash={post.mediaHash}
                            class="size-20 rounded-full bg-neutral-700 *:rounded-full"
                        />
                        <!-- TODO: ONLINE INDICATOR -->
                        <!-- TODO: CLICK TO OPEN PROFILE-->
                    </Avatar.Root>
                </a>
                <div class="w-full">
                    <div class={["font-bold mt-1", {"text-white": post.text}]}>
                        {post.text ? post.text : post.displayName ? `${post.displayName} joined` : 'Joined'}
                    </div>
                    {#if post.media.length}
                        <div class="mt-2">
                            {#each post.media as image}
                                <!-- TODO: CLICK TO OPEN LARGER IMAGE-->
                                <img src={image.thumbnailUrl} alt="" class="rounded-lg"/>
                            {/each}

                        </div>
                    {/if}
                    <div class="flex justify-between mt-2">
                        <div class="flex items-center gap-2">
                            <ClockIcon class="size-4 inline-block"/>
                            <RelativeTimeDynamic
                                date={post.posted}
                            />
                            {#if post.distance}
                                <NavigationArrowIcon class="size-4 inline-block -scale-x-100"/>
                                <DistanceFormatted distance={post.distance} />
                            {/if}
                            {#if post.hosting}
                                <HouseIcon class="size-4 inline-block text-fuchsia-700" weight="fill"/>
                            {/if}
                        </div>
                        <div>
                            <a href="/chat/{[post.profileId, ourProfileId].toSorted((a, b) => a - b).join(":")}">
                                <ChatIcon class="size-4 inline-block"/>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        {/each}
    {/if}
</div>
