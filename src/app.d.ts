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
		};
		__REGRIND_FCM_TOKEN?: string;
		__REGRIND_PUSH_ROUTE?: string;
	}
}

export {};
