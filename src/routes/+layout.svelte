<script lang="ts">
	import "@fontsource-variable/ibm-plex-sans/wght.css";
	import "@fontsource-variable/ibm-plex-sans/wght-italic.css";

	import "../layout.css";
	import { afterNavigate, beforeNavigate } from "$app/navigation";
	import IconContext from "phosphor-svelte/lib/IconContext";
	import { onMount } from "svelte";
	import { toast, Toaster } from "svelte-sonner";

	import { startGoogleHandoffWatch } from "$lib/api/google-handoff";
	import {
		hydratePreferences,
		preferencesLoaded,
		preferencesSnapshot,
	} from "$lib/app-data/preferences.svelte";
	import { initTheme } from "$lib/app-data/theme.svelte";
	import { abortBackdropBlurTrialGesture } from "$lib/blur/calibration/trial.svelte";
	import { hydrateBackdropCompositing } from "$lib/blur/compositing.svelte";
	import { applyBackdropBlurQuality } from "$lib/blur/quality.svelte";
	import { takeDemoAnnouncement } from "$lib/demo/config";
	import {
		applyAndroidInsets,
		applyBackGestureHandler,
		registerAndroidBackButtonListener,
	} from "$lib/platform/android-native-bridge";
	import { blockNativeMenu } from "$lib/platform/block-native-menu";
	import { blockZoom } from "$lib/platform/block-zoom";
	import { trackHoverPointer } from "$lib/platform/hover-pointer";
	import { keepLinksInApp } from "$lib/platform/in-app-links";
	import { applyKeepScreenOn } from "$lib/platform/keep-screen-on";
	import { applyKeyboardInset } from "$lib/platform/keyboard-inset";
	import { isAndroidPlatform, isMobilePlatform } from "$lib/platform/os";
	import { installScrollGestureBridge } from "$lib/platform/scroll-gesture";
	import {
		applySwipeBackGesture,
		settleSwipeBack,
	} from "$lib/platform/swipe-back-gesture";
	import {
		rememberScreen,
		trackScreenScroll,
	} from "$lib/platform/swipe-back-ghost";
	import { startAddonUpdateWatch } from "$lib/updates/addon.svelte";
	import { updatesSelfManaged } from "$lib/updates/capability.svelte";
	import { startUpdateWatch } from "$lib/updates/updates-manager";
	import {
		bottomBlurBarClearance,
		bottomChromeClearance,
		screenChromeCovered,
		topBlurBarClearance,
		topChromeClearance,
	} from "$lib/util/screen-chrome.svelte";

	onMount(() => {
		installScrollGestureBridge();
		if (env.PUBLIC_TEST_INSETS) {
			window.__AndroidInsets = {
				top() {
					return 64;
				},
				bottom() {
					return 64;
				},
				left() {
					return 0;
				},
				right() {
					return 0;
				},
			};
		}
		applyAndroidInsets();
		// Must follow applyAndroidInsets — it reads the inset that call writes.
		const releaseKeyboardInset = applyKeyboardInset();
		applyBackGestureHandler();
		const releaseZoomBlock = blockZoom();
		const releaseSwipeBack = applySwipeBackGesture();
		const releaseScreenScroll = screen
			? trackScreenScroll(screen)
			: () => {};
		const releaseTheme = initTheme();
		const releaseNativeMenuBlock = blockNativeMenu();
		const releaseHoverPointer = trackHoverPointer();
		const releaseInAppLinks = keepLinksInApp();
		if (isAndroidPlatform()) {
			void registerAndroidBackButtonListener().catch((error) => {
				console.error("Failed to register back button listener", error);
			});
		}
		void hydratePreferences().catch((error: unknown) => {
			console.error("Failed to hydrate preferences", error);
		});
		void hydrateBackdropCompositing().catch((error: unknown) => {
			console.error("Failed to read backdrop compositing", error);
		});
		const demoMode = takeDemoAnnouncement();
		if (demoMode !== undefined) {
			toast(demoMode ? "Demo mode on" : "Demo mode off");
		}
		return () => {
			releaseKeyboardInset();
			releaseZoomBlock();
			releaseSwipeBack();
			releaseScreenScroll();
			releaseTheme();
			releaseNativeMenuBlock();
			releaseHoverPointer();
			releaseInAppLinks();
		};
	});

	import { env } from "$env/dynamic/public";

	import faviconPng from "$lib/assets/favicon.png";
	import AccountStatusAlert from "$lib/components/feedback/AccountStatusAlert.svelte";
	import CopyErrorConfirmAlert from "$lib/components/feedback/CopyErrorConfirmAlert.svelte";
	import GoogleHandoffConfirmAlert from "$lib/components/feedback/GoogleHandoffConfirmAlert.svelte";
	import RequestBlockedAlert from "$lib/components/feedback/RequestBlockedAlert.svelte";
	import SessionErrorAlert from "$lib/components/feedback/SessionErrorAlert.svelte";
	import faviconSvg from "../../contrib/logo/regrind.svg";

	let { children }: { children?: import("svelte").Snippet } = $props();

	const onboarded = $derived(
		preferencesLoaded() && preferencesSnapshot().onboardingComplete,
	);

	let screen: HTMLDivElement | null = $state(null);

	beforeNavigate(({ type }) => {
		abortBackdropBlurTrialGesture();
		if (type !== "leave" && screen && isMobilePlatform())
			rememberScreen(screen);
	});
	afterNavigate(() => settleSwipeBack());

	$effect(() => {
		applyBackdropBlurQuality();
	});

	$effect(() => {
		applyKeepScreenOn();
	});

	$effect(() => {
		if (!onboarded) return;
		const appUpdates = updatesSelfManaged()
			? startUpdateWatch()
			: Promise.resolve();
		void appUpdates.finally(() => startAddonUpdateWatch());
	});

	$effect(() => {
		if (!onboarded) return;
		const watch = startGoogleHandoffWatch();
		return () => {
			void watch.then((stop) => stop());
		};
	});

	const toastOffset = $derived(
		screenChromeCovered()
			? {
					top: "calc(var(--safe-area-top) + 0.5rem)",
					bottom: "calc(var(--safe-area-bottom) + 0.5rem)",
				}
			: {
					top: `calc(max(var(--safe-area-top), ${topChromeClearance()}px, ${topBlurBarClearance()}px + var(--bar-content-gap)) + 0.5rem)`,
					bottom: `calc(max(var(--safe-area-bottom), ${bottomChromeClearance()}px, ${bottomBlurBarClearance()}px + var(--bar-content-gap)) + 0.5rem)`,
				},
	);
</script>

<svelte:head>
	<link rel="icon" href={faviconPng} sizes="any" />
	<link rel="icon" href={faviconSvg} type="image/svg+xml" />
</svelte:head>
<div
	data-slot="safe-area-strip"
	class={[
		"fixed inset-x-0 top-0 z-safe-area",
		{
			"bg-background/50": !env.PUBLIC_TEST_INSETS,
			"bg-red-900": env.PUBLIC_TEST_INSETS,
		},
	]}
	style:height="var(--safe-area-top)"
></div>
<div
	data-slot="safe-area-strip"
	class={[
		"fixed inset-x-0 bottom-0 z-safe-area",
		{
			"bg-background/50": !env.PUBLIC_TEST_INSETS,
			"bg-red-900": env.PUBLIC_TEST_INSETS,
		},
	]}
	style:height="var(--safe-area-bottom)"
></div>
<IconContext values={{ "aria-hidden": true }}>
	<div data-slot="toast-host" class="contents">
		<Toaster
			position="bottom-center"
			offset={toastOffset}
			mobileOffset={toastOffset}
			toastOptions={{ class: "toast" }}
			expand
		/>
	</div>
	<div id="screen-nav-root" bind:this={screen}>
		{@render children?.()}
	</div>
	<RequestBlockedAlert />
	<SessionErrorAlert />
	<AccountStatusAlert />
	<CopyErrorConfirmAlert />
	<GoogleHandoffConfirmAlert />
</IconContext>
