// @vitest-environment jsdom

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import {
	offer,
	settled,
	toastsFake,
	updateApiFake,
} from "#lib/updates/updates-test-helpers.ts";
import type { Capability } from "#lib/updates/types.ts";

const ASCII_LETTER = /[A-Za-z]/;

const fake = updateApiFake();
const toasts = toastsFake();
const { api } = fake;
const { callMethodMock, pageMock, toastMock, store, getUpdateCapability } =
	vi.hoisted(() => ({
		getUpdateCapability: vi.fn<() => Promise<Capability>>(),
		callMethodMock: vi.fn(),
		pageMock: { url: new URL("http://localhost/") },
		toastMock: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
		store: { isPlayBuild: vi.fn(() => false) },
	}));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/state", () => ({ page: pageMock }));
vi.mock("#lib/api/methods.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/methods.ts")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("#lib/updates/index.ts", async () => ({
	...(await import("#lib/updates/types.ts")),
	...(await import("#lib/updates/components.ts")),
	...fake.api,
	getUpdateCapability,
}));
vi.mock("#lib/updates/toasts.ts", () => toasts);
vi.mock("#lib/platform/store.ts", () => store);
vi.mock("#lib/platform/link-opener.ts", () => ({ openExternalLink: vi.fn() }));

let testing: typeof import("@testing-library/svelte");

const releaseSigned: Capability = {
	state: "supported",
	detail: { payloadSuffix: "-android.apk", canInstallNow: true },
};

async function opened() {
	testing = await import("@testing-library/svelte");
	const { hydrateUpdateCapability } =
		await import("#lib/updates/capability.svelte.ts");
	await hydrateUpdateCapability();
	const { default: GoogleSignInForm } =
		await import("./GoogleSignInForm.svelte");
	const { container } = testing.render(GoogleSignInForm);
	await settled();
	return { container, screen: testing.screen };
}

function textOf(node: Node | null | undefined) {
	return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function slot(container: HTMLElement, name: string) {
	return container.querySelector(`[data-slot="${name}"]`);
}

function companionLink() {
	return testing.screen.getByRole("link", {
		name: "Open Grind Google OAuth app",
	});
}

async function switchLocale(locale: string) {
	const { setLocale } = await import("#lib/i18n/index.ts");
	await setLocale({ locale });
}

function expectPseudo(lines: readonly (Node | null | undefined)[]) {
	for (const line of lines) expect(textOf(line)).toMatch(PSEUDO_MESSAGE);
}

describe("GoogleSignInForm in the active locale", () => {
	beforeAll(async () => {
		await import("@testing-library/svelte");
		await import("./GoogleSignInForm.svelte");
	}, 30_000);

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		fake.reset();
		pageMock.url.search = "";
		runningOn("android");
		store.isPlayBuild.mockReturnValue(false);
		api.checkForUpdate.mockResolvedValue(offer("install"));
		getUpdateCapability.mockResolvedValue(releaseSigned);
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(async () => {
		testing.cleanup();
		vi.restoreAllMocks();
		resetPlatform();
		await switchLocale(SOURCE_LOCALE);
	});

	it("translates the token form off Android", async () => {
		runningOn("linux");
		const { container, screen } = await opened();
		const token = screen.getByLabelText("Token");
		const signIn = screen.getByRole("button", { name: "Sign in" });
		const goBack = screen.getByRole("link", { name: "Go back" });
		const link = companionLink();

		await switchLocale("en-XA");

		const steps = screen.getAllByRole("listitem");
		expect(steps).toHaveLength(3);
		expectPseudo([
			slot(container, "card-title"),
			...steps,
			container.querySelector('label[for="token"]'),
			signIn,
			goBack,
		]);
		expect(textOf(steps[2])).toContain(`“${textOf(signIn)}”`);
		expect(token.getAttribute("placeholder")).toMatch(PSEUDO_MESSAGE);
		expect(textOf(link)).not.toMatch(ASCII_LETTER);
	});
});
