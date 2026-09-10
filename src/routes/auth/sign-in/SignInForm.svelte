<script lang="ts">
	import SiFacebook from "@icons-pack/svelte-simple-icons/icons/SiFacebook";
	import SiGoogle from "@icons-pack/svelte-simple-icons/icons/SiGoogle";
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
					<SiGoogle class="size-4" aria-hidden="true" />
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
					<SiFacebook class="size-4" aria-hidden="true" />
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
