import type { ComponentKey } from "./components";
import { openInstallPermissionSettings } from "./index";

let permissionOwner: ComponentKey | null = null;

function visible(): boolean {
	return document.visibilityState === "visible";
}

export class ReturnAction {
	#pending: (() => void) | null = null;

	runOnceVisible(action: () => void): void {
		if (visible()) {
			action();
			return;
		}
		this.forget();
		const resume = (): void => {
			if (!visible()) return;
			this.forget();
			action();
		};
		this.#pending = resume;
		document.addEventListener("visibilitychange", resume);
	}

	forget(): void {
		if (!this.#pending) return;
		document.removeEventListener("visibilitychange", this.#pending);
		this.#pending = null;
	}
}

export async function openPermissionScreen({
	component,
	onReturn,
}: {
	component: ComponentKey;
	onReturn: () => void;
}): Promise<boolean> {
	try {
		await openInstallPermissionSettings();
	} catch {
		return false;
	}
	permissionOwner = component;
	const resume = (): void => {
		if (!visible()) return;
		document.removeEventListener("visibilitychange", resume);
		if (permissionOwner !== component) return;
		permissionOwner = null;
		onReturn();
	};
	document.addEventListener("visibilitychange", resume);
	return true;
}
