<script lang="ts">
	import { callMethod } from "#lib/api/methods.ts";
	import { finishSignIn, reportSignInFailure } from "#lib/api/sign-in.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Card from "#lib/components/ui/card/index.ts";
	import { Label } from "#lib/components/ui/label/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { Textarea } from "#lib/components/ui/textarea/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import Rich from "#lib/i18n/Rich.svelte";
	import { GOOGLE_OAUTH_COMPONENT } from "#lib/updates/index.ts";
	import { manualInstallHref } from "#lib/updates/manual-install.ts";

	const companionHref = manualInstallHref(GOOGLE_OAUTH_COMPONENT);

	let token = $state("");
	let submitting = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		try {
			submitting = true;
			await finishSignIn(
				await callMethod("sign_in_with_google_token", {
					token: token.trim(),
				}),
			);
		} catch (error) {
			reportSignInFailure({ error });
		} finally {
			submitting = false;
		}
	}
</script>

{#snippet companionLink(text: string)}
	<Link
		href={companionHref}
		class="font-medium text-primary underline underline-offset-2"
	>
		{text}
	</Link>
{/snippet}

<form onsubmit={submit} class="m-auto flex w-full max-w-sm flex-col gap-3">
	<Card.Root class="gap-4">
		<Card.Header>
			<Card.Title>{t("auth.signIn.google.title")}</Card.Title>
			<Card.Description>
				<ol class="ms-5 list-decimal">
					<li>
						<Rich
							key="auth.signIn.google.paste.steps.install"
							{companionLink}
						/>
					</li>
					<li>{t("auth.signIn.google.paste.steps.copyToken")}</li>
					<li>
						{t("auth.signIn.google.paste.steps.submit", {
							button: t("auth.signIn.submit"),
						})}
					</li>
				</ol>
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="mt-2 grid gap-2">
				<Label for="token">
					{t("auth.signIn.google.paste.token.label")}
				</Label>
				<Textarea
					id="token"
					placeholder={t(
						"auth.signIn.google.paste.token.placeholder",
					)}
					required
					rows={5}
					bind:value={token}
					disabled={submitting}
					class="rounded-lg font-mono text-sm"
				/>
			</div>
		</Card.Content>
		<Card.Footer class="flex-col gap-2">
			<Button
				type="submit"
				class="w-full"
				disabled={submitting || token.trim().length === 0}
				aria-busy={submitting}
			>
				{#if submitting}
					<Spinner aria-hidden="true" />
				{/if}
				{t("auth.signIn.submit")}
			</Button>
			<Button
				variant="outline"
				class="w-full"
				href="/auth/sign-in"
				disabled={submitting}
			>
				{t("auth.signIn.google.goBack")}
			</Button>
		</Card.Footer>
	</Card.Root>
</form>
