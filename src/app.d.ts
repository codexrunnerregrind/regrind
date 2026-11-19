import type { KeyboardMotion } from "#lib/platform/keyboard-follow.ts";
import type { NativeInsets } from "#lib/platform/native-insets.ts";

declare global {
	const __DEMO__: boolean;
	const __SCREENSHOTS__: boolean;

	namespace App {
		interface Error {
			type?: string;
		}

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
			imeVisible(): boolean;
		};
		__iosInsets?: NativeInsets;
		__iosKeyboardMotion?: (motion: KeyboardMotion) => void;
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
			replyResult?(key: string, text: string, sent: boolean): void;
		};
		__RegrindFlip?: {
			available(): boolean;
			setEnabled(enabled: boolean): void;
		};
		/** Native hands a chat notification's inline reply to this. */
		__regrindNotificationReply?: (reply: unknown) => void;
		__REGRIND_FCM_TOKEN?: string;
		/** Why native has no push token, when it knows it never will. */
		__REGRIND_FCM_UNAVAILABLE?: string;
		__REGRIND_PUSH_ROUTE?: string;
		__AndroidOnBackGestureStart?: () => boolean;
		__AndroidOnBackGestureCancel?: () => void;
		__iosBack?: {
			start(point: { x: number; y: number }): boolean;
			progress(progress: number): void;
			finish(release: { commit: boolean; velocity: number }): void;
			prepare(): void;
		};
		__iosStatusBarTap?: () => void;
		__iosVoiceOver?: (running: boolean) => void;
		pswp?: unknown;
	}
}

export {};
