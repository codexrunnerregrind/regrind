import { failMode, harnessOptions } from "./config";
import {
	bridge,
	canInstallPackages,
	clearOverride,
	launchApp,
	stopApp,
	unbridge,
	writeOverride,
} from "./device";
import { startServer, type Harness, type Release } from "./server";

export const failingMarker = failMode ? `   FAILING: ${failMode}` : "";

export function printSteps(steps: string[]): string {
	return steps.map((step, index) => `  ${index + 1}. ${step}`).join("\n");
}

export async function serveOnDevice({
	releases,
}: {
	releases: Release[];
}): Promise<{ harness: Harness; permitted: boolean }> {
	const harness = await startServer({ ...harnessOptions, releases });
	const teardown = async () => {
		await stopApp();
		await clearOverride();
		await unbridge();
		await harness.stop();
	};
	const stop = async () => {
		console.log("\nstopping");
		await teardown();
		process.exit(0);
	};
	process.on("SIGINT", () => void stop());
	process.on("SIGTERM", () => void stop());

	try {
		await bridge();
		await writeOverride({ origin: harness.origin, key: harness.publicKey });
		await launchApp();
		return { harness, permitted: await canInstallPackages() };
	} catch (error) {
		await teardown();
		throw error;
	}
}
