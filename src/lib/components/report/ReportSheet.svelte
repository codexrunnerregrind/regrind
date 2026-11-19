<script lang="ts">
	import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
	import ShieldIcon from "phosphor-svelte/lib/ShieldIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";
	import { untrack } from "svelte";

	import { blockUser } from "#lib/api/browse/blocks.ts";
	import { showErrorToast } from "#lib/api/error-toast.ts";
	import {
		reportProfile,
		reportRightNowPost,
	} from "#lib/api/safety/reports.ts";
	import { Button, buttonVariants } from "#lib/components/ui/button/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import RadioGroup from "#lib/components/ui/radio/RadioGroup.svelte";
	import RadioItem from "#lib/components/ui/radio/RadioItem.svelte";
	import * as ResponsiveDialog from "#lib/components/ui/responsive-dialog/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { Textarea } from "#lib/components/ui/textarea/index.ts";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.ts";
	import { type MessageKey, t } from "#lib/i18n/index.ts";
	import {
		type ReportLocation,
		reportLocationSchema,
		type ReportReason,
		reportReasonSchema,
	} from "#lib/model/safety/reports.ts";
	import { grindrHelpUrl } from "#lib/util/grindr-help.ts";
	import type { Profile } from "#lib/model/users/profiles.ts";
	import { showBlockFailure } from "./block-failure";
	import { buildReportRequest, type ReportTarget } from "./report-request";

	let {
		open = $bindable(),
		target,
		onBlock,
	}: { open: boolean; target: ReportTarget; onBlock?: () => void } = $props();

	const reasonKeys = {
		SPAM: "profile.report.reason.spam",
		HARASSMENT_BULLYING: "profile.report.reason.harassmentBullying",
		HATE_DISCRIMINATION: "profile.report.reason.hateDiscrimination",
		NUDITY_PORNOGRAPHY: "profile.report.reason.nudityPornography",
		UNDERAGE: "profile.report.reason.underage",
		IMPERSONATION: "profile.report.reason.impersonation",
		ILLEGAL_ACTIVITY: "profile.report.reason.illegalActivity",
		SEXUAL_SOLICITATION: "profile.report.reason.sexualSolicitation",
		SERIOUS_IN_PERSON_INCIDENT:
			"profile.report.reason.seriousInPersonIncident",
	} as const satisfies Record<ReportReason, MessageKey>;

	const locationKeys = {
		PROFILE_PHOTO: "profile.report.location.profilePhoto",
		PROFILE_INFORMATION: "profile.report.location.profileInformation",
		CHAT_MESSAGE: "profile.report.location.chatMessage",
		ALBUM: "profile.report.location.album",
		RIGHT_NOW_PHOTO: "profile.report.location.rightNowPhoto",
		RIGHT_NOW_TEXT: "profile.report.location.rightNowText",
	} as const satisfies Record<ReportLocation, MessageKey>;

	const targetKeys = {
		profile: {
			title: "profile.report.profile.title",
			description: "profile.report.profile.a11y.description",
			reviewed: "profile.report.reviewed",
		},
		message: {
			title: "profile.report.message.title",
			description: "profile.report.message.a11y.description",
			reviewed: "profile.report.reviewed",
		},
		rightNowPost: {
			title: "profile.report.rightNowPost.title",
			description: "profile.report.rightNowPost.a11y.description",
			reviewed: "profile.report.rightNowPost.reviewed",
		},
	} as const satisfies Record<
		ReportTarget["kind"],
		Record<"title" | "description" | "reviewed", MessageKey>
	>;

	const presetLocations: Record<
		ReportTarget["kind"],
		ReportLocation[] | null
	> = {
		profile: null,
		message: ["CHAT_MESSAGE"],
		rightNowPost: ["RIGHT_NOW_PHOTO", "RIGHT_NOW_TEXT"],
	};

	const detailsLabel = $derived(t("profile.report.details"));

	let reason = $state<ReportReason | null>(null);
	let locations = $state<ReportLocation[]>([]);
	let comment = $state("");
	let submitting = $state(false);
	let submitted = $state(false);
	let onDetails = $state(false);

	const copy = $derived(targetKeys[target.kind]);
	const isSpam = $derived(reason === "SPAM");
	const reasonChosen = $derived(reason !== null);
	const isInPersonIncident = $derived(
		reason === "SERIOUS_IN_PERSON_INCIDENT",
	);
	const detailsShown = $derived(!isSpam && !isInPersonIncident);
	const wherePickerShown = $derived(
		detailsShown && presetLocations[target.kind] === null,
	);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			reason = null;
			locations = [...(presetLocations[target.kind] ?? [])];
			comment = "";
			submitted = false;
			onDetails = false;
		});
	});

	// Going back drops the picks rather than keeping them half-made: it leaves
	// the reason list live again, so the same reason can be tapped anew.
	function back() {
		reason = null;
		locations = [...(presetLocations[target.kind] ?? [])];
		onDetails = false;
	}

	async function submit() {
		if (submitting || reason === null) return;
		submitting = true;
		const report = buildReportRequest({ reason, comment, locations });
		try {
			if (target.kind === "rightNowPost")
				await reportRightNowPost({
					postId: target.postId,
					profileId: target.profileId,
					report,
				});
			else await reportProfile({ profileId: target.profileId, report });
			submitted = true;
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: t("profile.report.errors.sendFailed"),
				error,
			});
		} finally {
			submitting = false;
		}
	}

	function block({ profileId }: { profileId: Profile["profileId"] }) {
		open = false;
		if (onBlock) onBlock();
		else void blockInBackground({ profileId });
	}

	async function blockInBackground({
		profileId,
	}: {
		profileId: Profile["profileId"];
	}) {
		try {
			await blockUser({ profileId });
		} catch (error) {
			console.error(error);
			showBlockFailure(error);
		}
	}
</script>

{#snippet sectionLabel(text: string)}
	<span
		class="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
	>
		{text}
	</span>
{/snippet}

<ResponsiveDialog.Root bind:open>
	<ResponsiveDialog.Content
		class="flex flex-col gap-4"
		drawerClass="mx-auto max-w-160"
	>
		<ResponsiveDialog.Header drawerClass="px-4 pt-2 pb-0" class="gap-0">
			<div class="flex items-center gap-2">
				{#if onDetails && !submitted}
					<Button
						variant="ghost"
						size="icon-sm"
						class="-ms-1 bg-secondary"
						onclick={back}
					>
						<ArrowLeftIcon />
						<span class="sr-only">Back</span>
					</Button>
				{/if}
				<ResponsiveDialog.Title class="flex-1 text-left">
					{submitted ? t("profile.report.submitted") : t(copy.title)}
				</ResponsiveDialog.Title>
				<Button
					variant="ghost"
					size="icon-sm"
					class="-me-1 bg-secondary"
					onclick={() => (open = false)}
				>
					<XIcon />
					<span class="sr-only">{t("common.actions.close")}</span>
				</Button>
			</div>
			<ResponsiveDialog.Description class="sr-only">
				{t(copy.description)}
			</ResponsiveDialog.Description>
		</ResponsiveDialog.Header>
		{#if submitted}
			<ResponsiveDialog.Body drawerClass="px-4">
				<div
					data-slot="report-submitted"
					class="flex flex-col items-center gap-2 py-4 text-center"
				>
					<p>{t(copy.reviewed)}</p>
					{#if target.profileId !== null}
						<p class="text-sm text-muted-foreground">
							{t("profile.report.blockHint")}
						</p>
					{/if}
				</div>
			</ResponsiveDialog.Body>
			<ResponsiveDialog.Footer>
				{#if target.profileId !== null}
					{@const profileId = target.profileId}
					<Button
						variant="destructive"
						onclick={() => block({ profileId })}
					>
						{t("profile.topNav.actionsMenu.block")}
					</Button>
				{/if}
				<Button variant="secondary" onclick={() => (open = false)}>
					{t("profile.report.done")}
				</Button>
			</ResponsiveDialog.Footer>
		{:else}
			<fieldset disabled={submitting} class="contents">
				<ResponsiveDialog.Body
					class="flex flex-col gap-4"
					drawerClass="px-4"
				>
					{#if onDetails}
						<div
							data-slot="report-reason-summary"
							class="flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 p-3 ps-4"
						>
							<ShieldIcon class="size-5 text-primary" />
							<span class="min-w-0 flex-1 font-medium">
								{reason === null ? "" : t(reasonKeys[reason])}
							</span>
							<Button
								variant="link"
								size="sm"
								class="-me-1 px-1"
								onclick={back}
							>
								Change
							</Button>
						</div>
						{#if wherePickerShown}
							<div
								data-slot="report-locations"
								class="flex flex-col gap-1.5"
							>
								{@render sectionLabel(
									t("profile.report.whereItHappened"),
								)}
								<ToggleGroup.Root
									type="multiple"
									variant="outline"
									spacing={2}
									aria-label={t(
										"profile.report.whereItHappened",
									)}
									class="w-full flex-wrap gap-1"
									bind:value={
										() => locations,
										(next: string[]) =>
											(locations =
												next as ReportLocation[])
									}
								>
									{#each reportLocationSchema.options as value (value)}
										<ToggleGroup.Item {value}>
											{t(locationKeys[value])}
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							</div>
						{/if}
						{#if detailsShown}
							<div
								data-slot="report-details"
								class="flex flex-col gap-1.5"
							>
								{@render sectionLabel(detailsLabel)}
								<Textarea
									bind:value={comment}
									aria-label={detailsLabel}
									placeholder={detailsLabel}
									class="min-h-24 rounded-2xl"
								/>
							</div>
						{/if}
						{#if isInPersonIncident}
							<p
								data-slot="report-incident-note"
								class="px-1 text-sm text-muted-foreground"
							>
								{t("profile.report.inPersonIncident.note")}
							</p>
						{/if}
					{:else}
						<div data-slot="report-reasons">
							<RadioGroup
								name="report-reason"
								legend={t("profile.report.a11y.reason")}
								hideLegend={true}
								bind:value={
									() => reason ?? "",
									(next: string) => {
										reason =
											next === ""
												? null
												: (next as ReportReason);
										// Picking a reason is the step; nothing
										// else to decide here, so don't make
										// them confirm it.
										onDetails =
											reason !== null && next !== "SPAM";
									}
								}
							>
								{#each reportReasonSchema.options as value (value)}
									<RadioItem {value}>
										{t(reasonKeys[value])}
									</RadioItem>
								{/each}
							</RadioGroup>
						</div>
					{/if}
				</ResponsiveDialog.Body>
				<ResponsiveDialog.Footer>
					{#if isInPersonIncident}
						<Link
							href={grindrHelpUrl("inPersonIncidentForm")}
							class={buttonVariants()}
						>
							{t("profile.report.inPersonIncident.openHelpForm")}
							<ArrowUpRightIcon />
						</Link>
					{:else}
						<Button
							disabled={submitting || !reasonChosen}
							aria-busy={submitting}
							onclick={() => void submit()}
						>
							{#if submitting}
								<Spinner aria-hidden="true" />
							{/if}
							{t("profile.report.submit")}
						</Button>
					{/if}
				</ResponsiveDialog.Footer>
			</fieldset>
		{/if}
	</ResponsiveDialog.Content>
</ResponsiveDialog.Root>
