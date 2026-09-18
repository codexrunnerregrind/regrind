declare global {
	interface Window {
		__reapplyInsets: () => unknown;
		__AndroidInsets?: {
			top(): number;
			bottom(): number;
			left(): number;
			right(): number;
			imeVisible?(): boolean;
		};
		__AndroidOnBackGesture?: () => boolean;
		__AndroidBack?: { moveTaskToBack(): void };
		__RegrindPush?: {
			setPrefs(messages: boolean, taps: boolean): void;
			setActiveRoute(route: string | null): void;
			/** JSON; see NotificationPermission.kt. Absent on builds older than it. */
			permissionState?(): string;
			requestPermission?(): void;
			openNotificationSettings?(): void;
		};
		__REGRIND_FCM_TOKEN?: string;
		__REGRIND_PUSH_ROUTE?: string;
	}
}

export {};
