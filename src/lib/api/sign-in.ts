import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";

import {
	showAccountRestriction,
	showAccountStatus,
	showAccountStatusForError,
} from "$lib/api/account-status-state.svelte";
import { accountSignedIn } from "$lib/api/accounts.svelte";
import { showErrorToast } from "$lib/api/error-toast";
import {
	asAccountStatusError,
	asAppError,
	asBanned,
	blockedKindOf,
	markRequestBlocked,
	type Restriction,
} from "$lib/api/methods";
import { noticeStorageBackend } from "$lib/api/storage-notice";
import { clearProfileCaches } from "$lib/api/users/profiles";

type AppErrorView = NonNullable<ReturnType<typeof asAppError>>;

export const companionUnavailable = "companion-unavailable";
export const companionUntrusted = "companion-untrusted";
export const companionRefused = "companion-refused";
export const companionDisabled = "companion-disabled";
export const untrustedCompanionMessage =
	"The installed Open Grind Google OAuth app isn't signed by Open Grind, so its token was refused. Uninstall it, or paste the OAuth token manually.";
export const refusedCompanionMessage =
	"The Open Grind Google OAuth app only accepts official copies of Open Grind. Update it, or paste the OAuth token manually.";
export const disabledCompanionMessage =
	"The Open Grind Google OAuth app is turned off. Turn it on in Android settings, then try again.";

export async function finishSignIn(result: {
	restriction?: Restriction | null;
	profileId: number;
}): Promise<void> {
	if (showAccountRestriction(result.restriction)) return;
	clearProfileCaches();
	// The account has to be registered before the app leaves sign-in: the
	// screens it lands on read the active account's own preferences and caches.
	await accountSignedIn(result.profileId);
	void noticeStorageBackend();
	void goto("/");
}

export function reportSignInFailure({
	error,
	label,
	onAuthFailure = () => false,
	onFailure = () => false,
}: {
	error: unknown;
	label?: string;
	onAuthFailure?: (message: string) => boolean;
	onFailure?: (appError: AppErrorView) => boolean;
}): void {
	console.error(error);
	const appError = asAppError(error);
	const blockedKind = blockedKindOf(appError?.kind);
	if (blockedKind && markRequestBlocked({ kind: blockedKind })) return;
	if (appError?.kind === "Auth" && typeof appError.message === "string") {
		if (appError.message === "Sign-in canceled") return;
		if (appError.message === "account not registered") {
			toast.error(
				"Account not registered in Grindr. Register first using the official Grindr app",
			);
			return;
		}
		if (onAuthFailure(appError.message)) return;
	}
	if (appError && onFailure(appError)) return;
	const ban = asBanned(error);
	if (ban) {
		showAccountStatus({ kind: "banned", info: ban });
		return;
	}
	const accountStatusError = asAccountStatusError(error);
	if (accountStatusError) {
		showAccountStatusForError(accountStatusError);
		return;
	}
	if (appError?.kind === "RateLimited") {
		toast.error("Too many attempts. Please try again later.");
		return;
	}
	if (appError) {
		toast.error(appError.prettyMessage);
		return;
	}
	showErrorToast({ label, error });
}
