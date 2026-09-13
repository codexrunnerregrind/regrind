import { type CheckOptions, type CheckReport, UpdateFlow } from "./flow";
import { APP_COMPONENT } from "./index";
import { toastPresenter } from "./toast-presenter";

const app = new UpdateFlow({
	component: APP_COMPONENT,
	presenter: toastPresenter(APP_COMPONENT),
});

export function startUpdateWatch(): Promise<void> {
	return app.start();
}

export function checkForUpdateNow(
	options: CheckOptions = {},
): Promise<CheckReport> {
	return app.checkNow(options);
}
