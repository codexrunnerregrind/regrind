import type { NativeInsets } from "$lib/platform/android-native-bridge";

declare global {
	namespace App {
		interface PageState {
			profileOrigin?: "browse";
		}
	}

	interface Window {
		__reapplyInsets: (insets?: NativeInsets) => unknown;
		__AndroidInsets?: {
			top(): number;
			bottom(): number;
			left(): number;
			right(): number;
			imeVisible?(): boolean;
		};
		__AndroidOnBackGesture?: () => boolean;
		__AndroidBack?: { moveTaskToBack(): void; gestureProgress(): number };
		__RegrindPush?: {
			setPrefs(messages: boolean, taps: boolean): void;
			setActiveRoute(route: string | null): void;
			/** JSON; see NotificationPermission.kt. Absent on builds older than it. */
			permissionState?(): string;
			requestPermission?(): void;
			openNotificationSettings?(): void;
			refreshToken?(): void;
		};
		__REGRIND_FCM_TOKEN?: string;
		/** Why native has no push token, when it knows it never will. */
		__REGRIND_FCM_UNAVAILABLE?: string;
		__REGRIND_PUSH_ROUTE?: string;
		__AndroidOnBackGestureStart?: () => boolean;
		__AndroidOnBackGestureCancel?: () => void;
		pswp?: unknown;
	}
}

export {};
