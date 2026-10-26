<script lang="ts">
	import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
	import ShieldIcon from "phosphor-svelte/lib/ShieldIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";
	import { untrack } from "svelte";

	import { blockUser } from "$lib/api/browse/blocks";
	import { showErrorToast } from "$lib/api/error-toast";
	import { reportProfile } from "$lib/api/safety/reports";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import Link from "$lib/components/ui/link/Link.svelte";
	import RadioGroup from "$lib/components/ui/radio/RadioGroup.svelte";
	import RadioItem from "$lib/components/ui/radio/RadioItem.svelte";
	import * as ResponsiveDialog from "$lib/components/ui/responsive-dialog";
	import { Spinner } from "$lib/components/ui/spinner";
	import { Textarea } from "$lib/components/ui/textarea";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import {
		type ReportLocation,
		reportLocationSchema,
		type ReportReason,
		reportReasonSchema,
	} from "$lib/model/safety/reports";
	import { grindrHelpUrl } from "$lib/util/grindr-help";
	import type { Profile } from "$lib/model/users/profiles";
	import { showBlockFailure } from "./block-failure";
	import { buildProfileReport } from "./report-request";

	type ReportSubject = "profile" | "message";

	let {
		open = $bindable(),
		profileId,
		subject = "profile",
		locations: presetLocations,
		onBlock,
	}: {
		open: boolean;
		profileId: Profile["profileId"];
		subject?: ReportSubject;
		locations?: ReportLocation[];
		onBlock?: () => void;
	} = $props();

	const reasonLabels: Record<ReportReason, string> = {
		SPAM: "Spam",
		HARASSMENT_BULLYING: "Harassment or Bullying",
		HATE_DISCRIMINATION: "Hate Speech/Discrimination",
		NUDITY_PORNOGRAPHY: "Nudity or Pornography",
		UNDERAGE: "Underage",
		IMPERSONATION: "Impersonation",
		ILLEGAL_ACTIVITY: "Illegal Activity",
		SEXUAL_SOLICITATION: "Sexual Solicitation",
		SERIOUS_IN_PERSON_INCIDENT: "Serious In Person Incident",
	};

	const locationLabels: Record<ReportLocation, string> = {
		PROFILE_PHOTO: "Profile Photo",
		PROFILE_INFORMATION: "Profile Information",
		CHAT_MESSAGE: "Chat Message",
		ALBUM: "Album",
		RIGHT_NOW_PHOTO: "Right Now Image",
		RIGHT_NOW_TEXT: "Right Now Text",
	};

	const subjectCopy: Record<
		ReportSubject,
		{ title: string; description: string; reviewed: string }
	> = {
		profile: {
			title: "Report profile",
			description: "Send a report about this profile to Grindr.",
			reviewed: "Grindr will review this profile.",
		},
		message: {
			title: "Report message",
			description:
				"Send a report about this person's messages to Grindr.",
			reviewed: "Grindr will review your report.",
		},
	};

	const detailsLabel = "Details (optional)";

	let reason = $state<ReportReason | null>(null);
	let locations = $state<ReportLocation[]>([]);
	let comment = $state("");
	let submitting = $state(false);
	let submitted = $state(false);
	let onDetails = $state(false);

	const copy = $derived(subjectCopy[subject]);
	const isSpam = $derived(reason === "SPAM");
	const reasonChosen = $derived(reason !== null);
	const isInPersonIncident = $derived(
		reason === "SERIOUS_IN_PERSON_INCIDENT",
	);
	const detailsShown = $derived(!isSpam && !isInPersonIncident);
	const wherePickerShown = $derived(
		detailsShown && presetLocations === undefined,
	);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			reason = null;
			locations = [...(presetLocations ?? [])];
			comment = "";
			submitted = false;
			onDetails = false;
		});
	});

	// Going back drops the picks rather than keeping them half-made: it leaves
	// the reason list live again, so the same reason can be tapped anew.
	function back() {
		reason = null;
		locations = [...(presetLocations ?? [])];
		onDetails = false;
	}

	async function submit() {
		if (submitting || reason === null) return;
		submitting = true;
		try {
			await reportProfile({
				profileId,
				report: buildProfileReport({ reason, comment, locations }),
			});
			submitted = true;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to send report", error });
		} finally {
			submitting = false;
		}
	}

	function block() {
		open = false;
		if (onBlock) onBlock();
		else void blockInBackground();
	}

	async function blockInBackground() {
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
					{submitted ? "Report submitted" : copy.title}
				</ResponsiveDialog.Title>
				<Button
					variant="ghost"
					size="icon-sm"
					class="-me-1 bg-secondary"
					onclick={() => (open = false)}
				>
					<XIcon />
					<span class="sr-only">Close</span>
				</Button>
			</div>
			<ResponsiveDialog.Description class="sr-only">
				{copy.description}
			</ResponsiveDialog.Description>
		</ResponsiveDialog.Header>
		{#if submitted}
			<ResponsiveDialog.Body drawerClass="px-4">
				<div
					data-slot="report-submitted"
					class="flex flex-col items-center gap-2 py-4 text-center"
				>
					<p>{copy.reviewed}</p>
					<p class="text-sm text-muted-foreground">
						You can block this profile so you stop seeing it.
					</p>
				</div>
			</ResponsiveDialog.Body>
			<ResponsiveDialog.Footer>
				<Button variant="destructive" onclick={block}>
					Block profile
				</Button>
				<Button variant="secondary" onclick={() => (open = false)}>
					Done
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
								{reason === null ? "" : reasonLabels[reason]}
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
								{@render sectionLabel("Where it happened")}
								<ToggleGroup.Root
									type="multiple"
									variant="outline"
									spacing={2}
									aria-label="Where it happened"
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
											{locationLabels[value]}
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
								Grindr's trust and safety team handles serious
								in-person incidents through its help center. The
								form opens in your browser.
							</p>
						{/if}
					{:else}
						<div data-slot="report-reasons">
							<RadioGroup
								name="report-reason"
								legend="Reason"
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
										{reasonLabels[value]}
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
							Open help form <ArrowUpRightIcon />
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
							Submit report
						</Button>
					{/if}
				</ResponsiveDialog.Footer>
			</fieldset>
		{/if}
	</ResponsiveDialog.Content>
</ResponsiveDialog.Root>
