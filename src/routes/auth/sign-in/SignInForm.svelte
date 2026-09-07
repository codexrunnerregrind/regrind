<script lang="ts">
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import z from "zod";

	import {
		accountStatusState,
		showAccountRestriction,
	} from "$lib/api/account-status-state.svelte";
	import { accountSignedIn } from "$lib/api/accounts.svelte";
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		asAppError,
		asBanned,
		blockedKindOf,
		callMethod,
		markRequestBlocked,
	} from "$lib/api/methods";
	import { noticeStorageBackend } from "$lib/api/storage-notice";
	import { clearProfileCaches } from "$lib/api/users/profiles";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Spinner } from "$lib/components/ui/spinner";
	import RecaptchaUnsupported from "./RecaptchaUnsupported.svelte";

	let email = $state("");
	let password = $state("");
	let submitting: false | "password" | "google" = $state(false);
	let showPassword = $state(false);

	function handleAccountBlock(error: unknown): boolean {
		const ban = asBanned(error);
		if (ban) {
			accountStatusState.status = { kind: "banned", info: ban };
			accountStatusState.open = true;
			return true;
		}
		if (asAppError(error)?.kind === "RateLimited") {
			toast.error("Too many attempts. Please try again later.");
			return true;
		}
		return false;
	}

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		submitting = "password";
		try {
			const result = await callMethod("login", { email, password });
			if (showAccountRestriction(result.restriction)) return;
			clearProfileCaches();
			await accountSignedIn(result.profileId);
			void noticeStorageBackend();
			void goto("/");
		} catch (error) {
			console.error(error);
			const appError = asAppError(error);
			const blockedKind = blockedKindOf(appError?.kind);
			if (blockedKind && markRequestBlocked({ kind: blockedKind })) {
				return;
			}
			if (handleAccountBlock(error)) return;
			if (appError) {
				const invalidInputParameters = z
					.object({
						kind: z.literal("Api"),
						message: z.object({
							code: z.literal(4),
							message: z.literal("Invalid input parameters"),
						}),
					})
					.safeParse(appError).success;
				if (
					invalidInputParameters ||
					appError.kind === "Unauthorized"
				) {
					toast.error("Invalid email or password");
					void maybeCheckRecaptcha();
				} else {
					toast.error(appError.prettyMessage);
				}
			} else {
				showErrorToast({ error });
			}
		} finally {
			submitting = false;
		}
	}

	let recaptchaChecked = false;
	let recaptchaDialogOpen = $state(false);

	async function maybeCheckRecaptcha() {
		if (recaptchaChecked) return;
		recaptchaChecked = true;
		try {
			const enabled = await callMethod("recaptcha_first_party_enabled");
			if (enabled) recaptchaDialogOpen = true;
		} catch (error) {
			console.error(
				"[login] failed to check recaptcha_first_party assignment",
				error,
			);
		}
	}

	async function signInWithGoogle() {
		if (submitting) return;
		submitting = "google";
		try {
			const result = await callMethod("login_with_google");
			if (showAccountRestriction(result.restriction)) return;
			clearProfileCaches();
			void noticeStorageBackend();
			void goto("/");
		} catch (error) {
			console.error(error);
			const appError = asAppError(error);
			const blockedKind = blockedKindOf(appError?.kind);
			if (blockedKind && markRequestBlocked({ kind: blockedKind })) {
				return;
			}
			if (
				appError?.kind === "Auth" &&
				appError.message === "companion-unavailable"
			) {
				void goto("/auth/sign-in/google");
				return;
			}
			if (
				appError?.kind === "Auth" &&
				appError.message === "companion-untrusted"
			) {
				toast.error(
					"An app using the companion's name is installed but isn't signed by Open Grind, so its token was refused. Uninstall it, or paste the OAuth token manually.",
				);
				void goto("/auth/sign-in/google");
				return;
			}
			if (
				appError?.kind === "Auth" &&
				appError.message === "Sign-in canceled"
			) {
				return;
			}
			if (handleAccountBlock(error)) return;
			if (appError) {
				toast.error(appError.prettyMessage);
			} else {
				toast.error("Google sign-in failed");
			}
		} finally {
			submitting = false;
		}
	}
</script>

<form onsubmit={signIn} class="flex flex-1 flex-col">
	<div class="my-auto flex w-full max-w-sm flex-col gap-6 self-center py-10">
		<div class="flex flex-col gap-2">
			<h1 class="font-heading text-4xl font-bold tracking-tight">
				Sign in
			</h1>
			<p class="text-base text-muted-foreground">
				Use the email and password you signed up with.
			</p>
		</div>

		<div class="flex flex-col gap-4">
			<div class="grid gap-2">
				<Label for="email" class="text-sm text-muted-foreground">
					Email
				</Label>
				<Input
					id="email"
					type="email"
					placeholder="you@example.com"
					required
					autocomplete="email"
					bind:value={email}
					disabled={submitting !== false}
					class="h-13 rounded-xl border-border/60 px-4 text-base"
				/>
			</div>

			<div class="grid gap-2">
				<Label for="password" class="text-sm text-muted-foreground">
					Password
				</Label>
				<div class="relative">
					<Input
						id="password"
						type={showPassword ? "text" : "password"}
						required
						autocomplete="current-password"
						bind:value={password}
						disabled={submitting !== false}
						class="h-13 rounded-xl border-border/60 px-4 pe-18 text-base"
					/>
					<button
						type="button"
						class="absolute inset-y-0 end-4 text-sm font-medium text-primary"
						onclick={() => (showPassword = !showPassword)}
					>
						{showPassword ? "Hide" : "Show"}
					</button>
				</div>
				<a
					href="/auth/password-reset"
					class="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
				>
					Forgot your password?
				</a>
			</div>
		</div>

		<div class="flex flex-col gap-4">
			<Button
				type="submit"
				class="h-13 w-full rounded-xl text-base"
				disabled={submitting !== false}
			>
				{#if submitting === "password"}
					<Spinner />
				{/if}
				Sign in
			</Button>

			<div class="flex items-center gap-4 text-sm text-muted-foreground">
				<span class="h-px flex-1 bg-border"></span>
				or
				<span class="h-px flex-1 bg-border"></span>
			</div>

			<Button
				type="button"
				variant="outline"
				class="h-13 w-full gap-3 rounded-xl text-base"
				disabled={submitting !== false}
				onclick={signInWithGoogle}
			>
				{#if submitting === "google"}
					<Spinner />
				{:else}
					<svg viewBox="0 0 48 48" class="size-5" aria-hidden="true">
						<path
							fill="#EA4335"
							d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
						/>
						<path
							fill="#4285F4"
							d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
						/>
						<path
							fill="#FBBC05"
							d="M10.53 28.59A14.4 14.4 0 0 1 9.77 24c0-1.6.28-3.15.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z"
						/>
						<path
							fill="#34A853"
							d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
						/>
					</svg>
				{/if}
				Continue with Google
			</Button>
		</div>
	</div>

	<p class="mt-auto text-center text-sm text-muted-foreground">
		New here?
		<a
			href="/auth/sign-up"
			class="font-medium text-primary underline-offset-4 hover:underline"
		>
			Create an account
		</a>
	</p>
</form>
<RecaptchaUnsupported bind:open={recaptchaDialogOpen} />
