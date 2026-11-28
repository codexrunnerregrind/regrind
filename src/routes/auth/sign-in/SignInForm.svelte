<script lang="ts">
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import z from "zod";

	import { callMethod } from "#lib/api/methods.ts";
	import {
		companionDisabled,
		companionRefused,
		companionUnavailable,
		companionUntrusted,
		disabledCompanionMessage,
		finishSignIn,
		refusedCompanionMessage,
		reportSignInFailure,
		signInFlowEnded,
		signInInProgress,
		signInTimedOut,
		untrustedCompanionMessage,
	} from "#lib/api/sign-in.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { Input } from "#lib/components/ui/input/index.ts";
	import { Label } from "#lib/components/ui/label/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
	import { isAndroidPlatform } from "#lib/platform/os.ts";

	type OauthProvider = "google" | "facebook";

	const oauthProviders: Record<
		OauthProvider,
		{
			method: "sign_in_with_google" | "sign_in_with_facebook";
			label: string;
			failures: Record<string, () => void>;
		}
	> = {
		google: {
			method: "sign_in_with_google",
			label: "Google",
			failures: {
				[companionUnavailable]: () => void goto("/auth/sign-in/google"),
				[companionDisabled]: () =>
					toast.error(disabledCompanionMessage()),
				[companionUntrusted]: () => {
					toast.error(untrustedCompanionMessage());
					void goto("/auth/sign-in/google?paste");
				},
				[companionRefused]: () => {
					toast.error(refusedCompanionMessage());
					void goto("/auth/sign-in/google?paste");
				},
			},
		},
		facebook: {
			method: "sign_in_with_facebook",
			label: "Facebook",
			failures: {
				"facebook-dialog-error": () =>
					toast.error(t("auth.signIn.facebook.errors.dialogError")),
				"facebook-handoff-refused": () =>
					toast.error(
						t("auth.signIn.facebook.errors.handoffRefused"),
					),
				"facebook-unverified": () =>
					toast.error(t("auth.signIn.facebook.errors.unverified")),
			},
		},
	};

	const flowFailures: Record<string, (label: string) => void> = {
		[signInInProgress]: (label) =>
			toast.error(
				t("auth.signIn.errors.inProgress", { provider: label }),
			),
		[signInFlowEnded]: () => toast.error(t("auth.signIn.errors.flowEnded")),
		[signInTimedOut]: () => toast.error(t("auth.signIn.errors.timedOut")),
	};

	let email = $state("");
	let password = $state("");
	let submitting: false | "password" | OauthProvider = $state(false);
	let showPassword = $state(false);

	const refusedCredentialsSchema = z.union([
		z.object({ kind: z.literal("Unauthorized") }),
		z.object({
			kind: z.literal("Api"),
			message: z.object({
				code: z.literal(4),
				message: z.literal("Invalid input parameters"),
			}),
		}),
	]);

	const rejectedCaptchaSchema = z.object({
		kind: z.literal("Api"),
		message: z.object({ code: z.literal(18) }),
	});

	const recaptchaErrorSchema = z.object({
		kind: z.literal("Recaptcha"),
		message: z.object({ reason: z.string() }),
	});

	const captchaMessageKeys = {
		unsupportedPlatform:
			"auth.signIn.captcha.errors.credentialsOrUnsupportedPlatform",
		grindrMissing: "auth.signIn.captcha.errors.grindrMissing",
	} as const satisfies Record<string, PlainMessageKey>;

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		if (submitting) return;
		submitting = "password";
		try {
			const refusal = await trySignIn();
			if (refusal) await trySignInWithCaptcha(refusal);
		} finally {
			submitting = false;
		}
	}

	type Refusal = "credentials" | "captcha";

	const refusalAfterCaptchaMessageKeys = {
		captcha: "auth.signIn.captcha.errors.rejected",
		credentials: "auth.signIn.captcha.errors.credentialsOrRejected",
	} as const satisfies Record<Refusal, PlainMessageKey>;

	function refusalOf(error: unknown): Refusal | null {
		if (rejectedCaptchaSchema.safeParse(error).success) return "captcha";
		if (refusedCredentialsSchema.safeParse(error).success)
			return "credentials";
		return null;
	}

	async function trySignIn(captchaToken?: string): Promise<Refusal | null> {
		try {
			await finishSignIn(
				await callMethod("sign_in_with_email", {
					email,
					password,
					captchaToken,
				}),
			);
			return null;
		} catch (error) {
			const refusal = refusalOf(error);
			reportSignInFailure({ error, onFailure: () => refusal !== null });
			if (refusal === null || captchaToken === undefined) return refusal;
			toast.error(t(refusalAfterCaptchaMessageKeys[refusal]));
			return null;
		}
	}

	async function captchaAssigned(): Promise<boolean> {
		try {
			return await callMethod("recaptcha_first_party_enabled");
		} catch (error) {
			console.error(
				"[sign-in] failed to check recaptcha_first_party assignment",
				error,
			);
			return false;
		}
	}

	async function trySignInWithCaptcha(refusal: Refusal) {
		if (refusal === "credentials" && !(await captchaAssigned())) {
			toast.error(t("auth.signIn.errors.invalidCredentials"));
			return;
		}
		try {
			const captchaToken = await callMethod("mint_recaptcha_token", {
				action: "login",
			});
			await trySignIn(captchaToken);
		} catch (error) {
			reportCaptchaFailure(error);
		}
	}

	function reportCaptchaFailure(error: unknown) {
		const parsed = recaptchaErrorSchema.safeParse(error);
		const reason = parsed.success ? parsed.data.message.reason : undefined;
		const key =
			reason !== undefined && Object.hasOwn(captchaMessageKeys, reason)
				? captchaMessageKeys[reason as keyof typeof captchaMessageKeys]
				: "auth.signIn.captcha.errors.verifyFailed";
		toast.error(t(key));
	}

	async function signInWith(provider: OauthProvider) {
		if (submitting) return;
		if (provider === "google" && isAndroidPlatform()) {
			await goto("/auth/sign-in/google");
			return;
		}
		submitting = provider;
		const { method, label, failures } = oauthProviders[provider];
		try {
			await finishSignIn(await callMethod(method));
		} catch (error) {
			reportSignInFailure({
				error,
				label: t("auth.signIn.errors.providerFailed", {
					provider: label,
				}),
				onAuthFailure: (message) => {
					const handle = failures[message] ?? flowFailures[message];
					handle?.(label);
					return handle !== undefined;
				},
			});
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
					{t("auth.signIn.email.label")}
				</Label>
				<Input
					id="email"
					type="email"
					placeholder="you@example.com"
					required
					autocomplete="username"
					bind:value={email}
					disabled={submitting !== false}
					class="h-13 rounded-xl border-border/60 px-4 text-base"
				/>
			</div>

			<div class="grid gap-2">
				<Label for="password" class="text-sm text-muted-foreground">
					{t("auth.signIn.password.label")}
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
					{t("auth.signIn.forgotPassword")}
				</a>
			</div>
		</div>

		<div class="flex flex-col gap-4">
			<Button
				type="submit"
				class="h-13 w-full rounded-xl text-base"
				disabled={submitting !== false}
				aria-busy={submitting === "password"}
			>
				{#if submitting === "password"}
					<Spinner aria-hidden="true" />
				{/if}
				{t("auth.signIn.submit")}
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
				aria-busy={submitting === "google"}
				onclick={() => signInWith("google")}
			>
				{#if submitting === "google"}
					<Spinner aria-hidden="true" />
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

			<Button
				type="button"
				variant="outline"
				class="h-13 w-full gap-3 rounded-xl text-base"
				disabled={submitting !== false}
				aria-busy={submitting === "facebook"}
				onclick={() => signInWith("facebook")}
			>
				{#if submitting === "facebook"}
					<Spinner aria-hidden="true" />
				{:else}
					<svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
						<path
							fill="#1877F2"
							d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.926-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
						/>
						<path
							fill="#fff"
							d="m16.671 15.563.532-3.49h-3.328v-2.25c0-.948.465-1.874 1.956-1.874h1.513V4.996s-1.373-.235-2.686-.235c-2.741 0-4.533 1.672-4.533 4.697v2.615H7.078v3.49h3.047V24a12.1 12.1 0 0 0 3.75 0v-8.437h2.796z"
						/>
					</svg>
				{/if}
				Continue with Facebook
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
