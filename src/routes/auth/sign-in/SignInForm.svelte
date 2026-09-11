<script lang="ts">
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import z from "zod";

	import { callMethod } from "$lib/api/methods";
	import { finishSignIn, reportSignInFailure } from "$lib/api/sign-in";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Spinner } from "$lib/components/ui/spinner";
	import RecaptchaUnsupported from "./RecaptchaUnsupported.svelte";

	type OauthProvider = "google" | "facebook";

	const oauthProviders: Record<
		OauthProvider,
		{
			method: "login_with_google" | "login_with_facebook";
			label: string;
			failures: Record<string, () => void>;
		}
	> = {
		google: {
			method: "login_with_google",
			label: "Google",
			failures: {
				"companion-unavailable": () =>
					void goto("/auth/sign-in/google"),
				"companion-untrusted": () => {
					toast.error(
						"An app using the companion's name is installed but isn't signed by Open Grind, so its token was refused. Uninstall it, or paste the OAuth token manually.",
					);
					void goto("/auth/sign-in/google");
				},
			},
		},
		facebook: {
			method: "login_with_facebook",
			label: "Facebook",
			failures: {
				"facebook-dialog-error": () =>
					toast.error(
						"Facebook didn't grant access. Try again, or sign in with your email and password.",
					),
				"facebook-handoff-refused": () =>
					toast.error(
						"Facebook tried to open its own app, which ReGrind can't use. Sign in with your email and password instead.",
					),
			},
		},
	};

	let email = $state("");
	let password = $state("");
	let submitting: false | "password" | OauthProvider = $state(false);
	let showPassword = $state(false);

	const invalidCredentialsSchema = z.object({
		kind: z.literal("Api"),
		message: z.object({
			code: z.literal(4),
			message: z.literal("Invalid input parameters"),
		}),
	});

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		submitting = "password";
		try {
			await finishSignIn(await callMethod("login", { email, password }));
		} catch (error) {
			reportSignInFailure({
				error,
				onFailure: (appError) => {
					if (
						appError.kind !== "Unauthorized" &&
						!invalidCredentialsSchema.safeParse(appError).success
					) {
						return false;
					}
					toast.error("Invalid email or password");
					void maybeCheckRecaptcha();
					return true;
				},
			});
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

	async function signInWith(provider: OauthProvider) {
		if (submitting) return;
		submitting = provider;
		const { method, label, failures } = oauthProviders[provider];
		try {
			await finishSignIn(await callMethod(method));
		} catch (error) {
			reportSignInFailure({
				error,
				label: `${label} sign-in failed`,
				onAuthFailure: (message) => {
					const handle = failures[message];
					handle?.();
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
				onclick={() => signInWith("google")}
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

			<Button
				type="button"
				variant="outline"
				class="h-13 w-full gap-3 rounded-xl text-base"
				disabled={submitting !== false}
				onclick={() => signInWith("facebook")}
			>
				{#if submitting === "facebook"}
					<Spinner />
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
<RecaptchaUnsupported bind:open={recaptchaDialogOpen} />
