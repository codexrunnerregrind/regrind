import { sveltekit } from "@opengrind/config/eslint/svelte";
import { defineConfig } from "eslint/config";

import svelteConfig from "./svelte.config.js";

export default defineConfig(
	...sveltekit({
		svelteConfig,
		tailwindEntry: "src/layout.css",
		vendoredGlob: "src/lib/components/ui/**",
		ignores: [
			"src-tauri/",
			"reverse/",
			"docs/",
			"contrib/",
			"static/",
			"scripts/",
			"test-results/",
			"playwright-report/",
			// Design references, not source: prototype-runtime JS shipped with the
			// redesign handoff. Read them, don't port them.
			"design_handoff_nearby_app/",
			"ci/",
			"e2e/updater/",
		],
	}),
);
