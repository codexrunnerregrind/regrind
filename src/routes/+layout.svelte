<script lang="ts">
	import "@fontsource-variable/ibm-plex-sans/wght.css";
	import "@fontsource-variable/ibm-plex-sans/wght-italic.css";

	import "../layout.css";
	import "#lib/privacy/discreet-images.css";
	import { afterNavigate, beforeNavigate } from "$app/navigation";
	import IconContext from "phosphor-svelte/lib/IconContext";
	import { onMount } from "svelte";
	import { toast, Toaster } from "svelte-sonner";

	import { startGoogleHandoffWatch } from "#lib/api/google-handoff.ts";
	import { onProfileEdit } from "#lib/api/users/profiles.ts";
	import {
		hydratePreferences,
		preferencesLoaded,
		preferencesSnapshot,
	} from "#lib/app-data/preferences.svelte.ts";
	import { initTheme } from "#lib/app-data/theme.svelte.ts";
	import { abortBackdropBlurTrialGesture } from "#lib/blur/calibration/trial.svelte.ts";
	import { hydrateBackdropCompositing } from "#lib/blur/compositing.svelte.ts";
	import { applyBackdropBlurQuality } from "#lib/blur/quality.svelte.ts";
	import { swipeableTabIndex } from "#lib/components/shared/nav-tabs.ts";
	import { tabShellShowing } from "#lib/components/tab-shell/tab-shell-state.svelte.ts";
	import { takeDemoAnnouncement } from "#lib/demo/config.ts";
	import { t } from "#lib/i18n/index.ts";
	import { installAppLock } from "#lib/platform/app-lock.svelte.ts";
	import { blockNativeMenu } from "#lib/platform/block-native-menu.ts";
	import { blockZoom } from "#lib/platform/block-zoom.ts";
	import { trackHoverPointer } from "#lib/platform/hover-pointer.ts";
	import { keepLinksInApp } from "#lib/platform/in-app-links.ts";
	import { applyKeepScreenOn } from "#lib/platform/keep-screen-on.ts";
	import { applyKeyboardInset } from "#lib/platform/keyboard-inset.ts";
	import {
		installNativeInsets,
		type NativeInsets,
	} from "#lib/platform/native-insets.ts";
	import { isMobilePlatform } from "#lib/platform/os.ts";
	import { installScrollGestureBridge } from "#lib/platform/scroll-gesture.ts";
	import { applySoftKeyboardLayout } from "#lib/platform/soft-keyboard.svelte.ts";
	import {
		applySwipeBackGesture,
		settleSwipeBack,
	} from "#lib/platform/swipe-back-gesture.ts";
	import {
		forgetScreens,
		rememberScreen,
		trackScreenScroll,
	} from "#lib/platform/swipe-back-ghost.ts";
	import { installSystemBack } from "#lib/platform/system-back-gesture.svelte.ts";
	import { installVoiceOverWatch } from "#lib/platform/voice-over.svelte.ts";
	import { imagesHidden } from "#lib/privacy/image-privacy.svelte.ts";
	import { startAddonUpdateWatch } from "#lib/updates/addon.svelte.ts";
	import { updatesSelfManaged } from "#lib/updates/capability.svelte.ts";
	import { startUpdateWatch } from "#lib/updates/updates-manager.ts";
	import { recordHistory } from "#lib/util/history-log.svelte.ts";
	import { reducedMotion } from "#lib/util/reduced-motion.ts";
	import {
		bottomBlurBarClearance,
		bottomChromeClearance,
		screenChromeCovered,
		topBlurBarClearance,
		topChromeClearance,
	} from "#lib/util/screen-chrome.svelte.ts";

	// Apply before paint, including body-level media viewer and dialog portals.
	$effect.pre(() => {
		document.documentElement.toggleAttribute(
			"data-discreet-images",
			imagesHidden(),
		);
	});

	onMount(() => {
		installScrollGestureBridge();
		installNativeInsets({
			fallback: PUBLIC_TEST_INSETS ? TEST_INSETS : undefined,
		});
		// Must follow installNativeInsets — it reads the inset that call writes.
		const releaseKeyboardInset = applyKeyboardInset();
		const releaseZoomBlock = blockZoom();
		const releaseSwipeBack = applySwipeBackGesture();
		const releaseScreenScroll = screen
			? trackScreenScroll(screen)
			: () => {};
		const releaseTheme = initTheme();
		const releaseNativeMenuBlock = blockNativeMenu();
		const releaseHoverPointer = trackHoverPointer();
		const releaseInAppLinks = keepLinksInApp();
		const releaseAppLock = installAppLock();
		installSystemBack();
		installVoiceOverWatch();
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
			releaseAppLock();
		};
	});

	import { PUBLIC_TEST_INSETS } from "$app/env/public";

	import faviconPng from "#lib/assets/favicon.png";
	import AccountStatusAlert from "#lib/components/feedback/AccountStatusAlert.svelte";
	import AppLockScreen from "#lib/components/feedback/AppLockScreen.svelte";
	import CopyErrorConfirmAlert from "#lib/components/feedback/CopyErrorConfirmAlert.svelte";
	import GoogleHandoffConfirmAlert from "#lib/components/feedback/GoogleHandoffConfirmAlert.svelte";
	import RequestBlockedAlert from "#lib/components/feedback/RequestBlockedAlert.svelte";
	import SessionErrorAlert from "#lib/components/feedback/SessionErrorAlert.svelte";
	import faviconSvg from "../../contrib/logo/regrind.svg";

	let { children }: { children?: import("svelte").Snippet } = $props();

	const TEST_INSETS: NativeInsets = {
		top: 64,
		bottom: 64,
		left: 0,
		right: 0,
		ime: false,
	};

	const onboarded = $derived(
		preferencesLoaded() && preferencesSnapshot().onboardingComplete,
	);

	recordHistory();

	let screen: HTMLDivElement | null = $state(null);

	beforeNavigate(({ type, to }) => {
		abortBackdropBlurTrialGesture();
		if (type === "leave" || !screen || !isMobilePlatform()) return;
		if (!tabShellShowing()) {
			rememberScreen(screen);
			return;
		}
		// The tab shell holds up to three screens, and copying it on every tab
		// change had iOS kill the WebView: each copy loads all their images
		// again. A move between its tabs needs no copy, and leaving it only
		// the tab on show.
		if (swipeableTabIndex(to?.route.id) !== -1) return;
		const shown = screen.querySelector<HTMLElement>(
			"[data-tab-pane][data-active]",
		);
		if (shown) rememberScreen(shown);
	});
	afterNavigate(() => settleSwipeBack());
	// A back swipe onto an edited profile would show it as it was before.
	onMount(() =>
		onProfileEdit(({ profileId }) =>
			forgetScreens(`/profile/${profileId}`),
		),
	);

	$effect(() => {
		applyBackdropBlurQuality();
	});

	$effect(() => {
		applyKeepScreenOn();
	});

	$effect(() => {
		applySoftKeyboardLayout();
	});

	// For the CSS: the device's preference or the app's own setting.
	$effect(() => {
		document.documentElement.toggleAttribute(
			"data-reduce-motion",
			reducedMotion.current,
		);
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

	const toastOffset = $derived({
		...(screenChromeCovered()
			? {
					top: "calc(var(--safe-area-top) + 0.5rem)",
					bottom: "calc(var(--safe-area-bottom) + 0.5rem)",
				}
			: {
					top: `calc(max(var(--safe-area-top), ${topChromeClearance()}px, ${topBlurBarClearance()}px + var(--bar-content-gap)) + 0.5rem)`,
					bottom: `calc(max(var(--safe-area-bottom), ${bottomChromeClearance()}px, ${bottomBlurBarClearance()}px + var(--bar-content-gap)) + 0.5rem)`,
				}),
		left: "calc(var(--safe-area-left) + 1rem)",
		right: "calc(var(--safe-area-right) + 1rem)",
	});
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
			"bg-background/50": !PUBLIC_TEST_INSETS,
			"bg-red-900": PUBLIC_TEST_INSETS,
		},
	]}
	style:height="var(--safe-area-top)"
></div>
<div
	data-slot="safe-area-strip"
	class={[
		"fixed inset-x-0 bottom-0 z-safe-area",
		{
			"bg-background/50": !PUBLIC_TEST_INSETS,
			"bg-red-900": PUBLIC_TEST_INSETS,
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
			swipeDirections={["top", "bottom", "left", "right"]}
			closeButton
			expand
			containerAriaLabel={t("shell.toaster.a11y.region")}
			closeButtonAriaLabel={t("shell.toaster.a11y.close")}
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
	<AppLockScreen />
</IconContext>
