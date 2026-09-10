import { hashText } from "./hash";
import type { CreditEntry, CreditsChunk } from "./types";

const textsDir = new URL("texts/", import.meta.url);

const textFiles = [
	"apache-2.0.txt",
	"bigint-license.txt",
	"fastdoubleparser-notice.txt",
	"jackson-core-notice.txt",
	"jackson-notice.txt",
	"noto-emoji-notice.txt",
	"shadcn-svelte-license.txt",
] as const;

type TextId = (typeof textFiles)[number];

const loadTexts = async () =>
	new Map(
		await Array.fromAsync(
			textFiles,
			async (file) =>
				[file, await Bun.file(new URL(file, textsDir)).text()] as const,
		),
	);

// sdk-dependencies/universalRelease/sdkDependencies.txt minus BOMs and KMP -jvm/-android halves
export const universalReleaseApk: Record<string, string> = {
	"androidx.activity:activity": "1.10.1",
	"androidx.activity:activity-ktx": "1.10.1",
	"androidx.annotation:annotation": "1.9.1",
	"androidx.annotation:annotation-experimental": "1.4.1",
	"androidx.appcompat:appcompat": "1.7.1",
	"androidx.appcompat:appcompat-resources": "1.7.1",
	"androidx.arch.core:core-common": "2.2.0",
	"androidx.arch.core:core-runtime": "2.2.0",
	"androidx.browser:browser": "1.8.0",
	"androidx.cardview:cardview": "1.0.0",
	"androidx.collection:collection": "1.2.0",
	"androidx.concurrent:concurrent-futures": "1.1.0",
	"androidx.constraintlayout:constraintlayout": "2.0.1",
	"androidx.constraintlayout:constraintlayout-solver": "2.0.1",
	"androidx.coordinatorlayout:coordinatorlayout": "1.1.0",
	"androidx.core:core": "1.13.1",
	"androidx.core:core-ktx": "1.13.1",
	"androidx.core:core-viewtree": "1.0.0",
	"androidx.cursoradapter:cursoradapter": "1.0.0",
	"androidx.customview:customview": "1.1.0",
	"androidx.documentfile:documentfile": "1.0.0",
	"androidx.drawerlayout:drawerlayout": "1.1.1",
	"androidx.dynamicanimation:dynamicanimation": "1.0.0",
	"androidx.emoji2:emoji2": "1.3.0",
	"androidx.emoji2:emoji2-views-helper": "1.3.0",
	"androidx.exifinterface:exifinterface": "1.3.6",
	"androidx.fragment:fragment": "1.5.4",
	"androidx.interpolator:interpolator": "1.0.0",
	"androidx.legacy:legacy-support-core-utils": "1.0.0",
	"androidx.lifecycle:lifecycle-common": "2.10.0",
	"androidx.lifecycle:lifecycle-livedata": "2.10.0",
	"androidx.lifecycle:lifecycle-livedata-core": "2.10.0",
	"androidx.lifecycle:lifecycle-livedata-core-ktx": "2.10.0",
	"androidx.lifecycle:lifecycle-process": "2.10.0",
	"androidx.lifecycle:lifecycle-runtime": "2.10.0",
	"androidx.lifecycle:lifecycle-runtime-ktx": "2.10.0",
	"androidx.lifecycle:lifecycle-viewmodel": "2.10.0",
	"androidx.lifecycle:lifecycle-viewmodel-ktx": "2.10.0",
	"androidx.lifecycle:lifecycle-viewmodel-savedstate": "2.10.0",
	"androidx.loader:loader": "1.0.0",
	"androidx.localbroadcastmanager:localbroadcastmanager": "1.0.0",
	"androidx.media3:media3-common": "1.5.1",
	"androidx.media3:media3-container": "1.5.1",
	"androidx.media3:media3-database": "1.5.1",
	"androidx.media3:media3-datasource": "1.5.1",
	"androidx.media3:media3-decoder": "1.5.1",
	"androidx.media3:media3-effect": "1.5.1",
	"androidx.media3:media3-exoplayer": "1.5.1",
	"androidx.media3:media3-extractor": "1.5.1",
	"androidx.media3:media3-muxer": "1.5.1",
	"androidx.media3:media3-transformer": "1.5.1",
	"androidx.print:print": "1.0.0",
	"androidx.profileinstaller:profileinstaller": "1.4.0",
	"androidx.recyclerview:recyclerview": "1.1.0",
	"androidx.resourceinspection:resourceinspection-annotation": "1.0.1",
	"androidx.savedstate:savedstate": "1.4.0",
	"androidx.savedstate:savedstate-ktx": "1.4.0",
	"androidx.startup:startup-runtime": "1.1.1",
	"androidx.tracing:tracing": "1.0.0",
	"androidx.transition:transition": "1.5.0",
	"androidx.vectordrawable:vectordrawable": "1.1.0",
	"androidx.vectordrawable:vectordrawable-animated": "1.1.0",
	"androidx.versionedparcelable:versionedparcelable": "1.1.1",
	"androidx.viewpager2:viewpager2": "1.0.0",
	"androidx.viewpager:viewpager": "1.0.0",
	"androidx.webkit:webkit": "1.14.0",
	"com.fasterxml.jackson.core:jackson-annotations": "2.15.3",
	"com.fasterxml.jackson.core:jackson-core": "2.15.3",
	"com.fasterxml.jackson.core:jackson-databind": "2.15.3",
	"com.google.android.datatransport:transport-api": "3.1.0",
	"com.google.android.datatransport:transport-backend-cct": "3.1.9",
	"com.google.android.datatransport:transport-runtime": "3.1.9",
	"com.google.android.gms:play-services-base": "18.5.0",
	"com.google.android.gms:play-services-basement": "18.4.0",
	"com.google.android.gms:play-services-cloud-messaging": "17.2.0",
	"com.google.android.gms:play-services-location": "21.3.0",
	"com.google.android.gms:play-services-stats": "17.0.2",
	"com.google.android.gms:play-services-tasks": "18.2.0",
	"com.google.android.material:material": "1.12.0",
	"com.google.errorprone:error_prone_annotations": "2.26.0",
	"com.google.firebase:firebase-annotations": "16.2.0",
	"com.google.firebase:firebase-common": "21.0.0",
	"com.google.firebase:firebase-common-ktx": "21.0.0",
	"com.google.firebase:firebase-components": "18.0.0",
	"com.google.firebase:firebase-datatransport": "18.2.0",
	"com.google.firebase:firebase-encoders": "17.0.0",
	"com.google.firebase:firebase-encoders-json": "18.0.0",
	"com.google.firebase:firebase-encoders-proto": "16.0.0",
	"com.google.firebase:firebase-iid-interop": "17.1.0",
	"com.google.firebase:firebase-installations": "17.2.0",
	"com.google.firebase:firebase-installations-interop": "17.1.1",
	"com.google.firebase:firebase-measurement-connector": "19.0.0",
	"com.google.firebase:firebase-messaging": "24.1.2",
	"com.google.guava:failureaccess": "1.0.2",
	"com.google.guava:guava": "33.3.1-android",
	"com.google.guava:listenablefuture":
		"9999.0-empty-to-avoid-conflict-with-guava",
	"javax.inject:javax.inject": "1",
	"org.jetbrains.kotlin:kotlin-stdlib": "2.0.21",
	"org.jetbrains.kotlin:kotlin-stdlib-jdk7": "1.8.22",
	"org.jetbrains.kotlin:kotlin-stdlib-jdk8": "1.8.22",
	"org.jetbrains.kotlinx:kotlinx-coroutines-android": "1.9.0",
	"org.jetbrains.kotlinx:kotlinx-coroutines-core": "1.9.0",
	"org.jetbrains.kotlinx:kotlinx-coroutines-play-services": "1.9.0",
	"org.jetbrains.kotlinx:kotlinx-serialization-core": "1.7.3",
	"org.jetbrains:annotations": "23.0.0",
	"org.jspecify:jspecify": "1.0.0",
};

const jetpack = "https://developer.android.com/jetpack/androidx";

// Whole families share one page; listing every artifact would be noise.
const androidHomepagePrefixes: [string, string][] = [
	["androidx.", jetpack],
	["com.google.android.gms:", "https://developers.google.com/android"],
	["com.google.firebase:", "https://firebase.google.com/docs/android/setup"],
	[
		"com.google.android.datatransport:",
		"https://github.com/firebase/firebase-android-sdk",
	],
	["org.jetbrains.kotlin:", "https://github.com/JetBrains/kotlin"],
	[
		"org.jetbrains.kotlinx:kotlinx-coroutines",
		"https://github.com/Kotlin/kotlinx.coroutines",
	],
	["com.google.guava:", "https://github.com/google/guava"],
];

const androidHomepages: Record<string, string> = {
	"com.fasterxml.jackson.core:jackson-annotations":
		"https://github.com/FasterXML/jackson-annotations",
	"com.fasterxml.jackson.core:jackson-core":
		"https://github.com/FasterXML/jackson-core",
	"com.fasterxml.jackson.core:jackson-databind":
		"https://github.com/FasterXML/jackson-databind",
	"com.google.android.material:material":
		"https://github.com/material-components/material-components-android",
	"com.google.errorprone:error_prone_annotations":
		"https://github.com/google/error-prone",
	"javax.inject:javax.inject": "https://github.com/javax-inject/javax-inject",
	"org.jetbrains.kotlinx:kotlinx-serialization-core":
		"https://github.com/Kotlin/kotlinx.serialization",
	"org.jetbrains:annotations":
		"https://github.com/JetBrains/java-annotations",
	"org.jspecify:jspecify": "https://jspecify.dev",
};

const homepageOf = (coordinate: string) => {
	const url =
		androidHomepages[coordinate] ??
		androidHomepagePrefixes.find(([prefix]) =>
			coordinate.startsWith(prefix),
		)?.[1];
	if (!url) throw new Error(`no homepage for ${coordinate}`);
	return url;
};

type ManualEntry = Omit<CreditEntry, "textHashes"> & { texts: TextId[] };

const androidNotices: Record<string, TextId> = {
	"com.fasterxml.jackson.core:jackson-annotations": "jackson-notice.txt",
	"com.fasterxml.jackson.core:jackson-core": "jackson-core-notice.txt",
	"com.fasterxml.jackson.core:jackson-databind": "jackson-notice.txt",
};

const bundledOutsideNodeModules: ManualEntry[] = [
	{
		id: "fastdoubleparser",
		name: "FastDoubleParser (shaded into jackson-core)",
		ecosystem: "android",
		spdx: "MIT",
		url: "https://github.com/wrandelshofer/FastDoubleParser",
		texts: ["fastdoubleparser-notice.txt"],
	},
	{
		id: "tbuktu-bigint",
		name: "bigint (shaded into FastDoubleParser)",
		ecosystem: "android",
		spdx: "BSD-2-Clause",
		url: "https://github.com/tbuktu/bigint",
		texts: ["bigint-license.txt"],
	},
	{
		id: "noto-emoji",
		name: "Noto Emoji",
		ecosystem: "asset",
		spdx: "Apache-2.0",
		url: "https://github.com/googlefonts/noto-emoji",
		texts: ["apache-2.0.txt", "noto-emoji-notice.txt"],
	},
	{
		id: "shadcn-svelte",
		name: "shadcn-svelte",
		version: "1.2.7",
		ecosystem: "npm",
		spdx: "MIT",
		url: "https://shadcn-svelte.com",
		texts: ["shadcn-svelte-license.txt"],
	},
];

export const collectManualCredits = async (): Promise<CreditsChunk> => {
	const texts = await loadTexts();
	const hashOf = (id: TextId) => hashText(texts.get(id)!);

	const android = Object.entries(universalReleaseApk).map(
		([coordinate, version]): ManualEntry => ({
			id: coordinate,
			name: coordinate,
			version,
			ecosystem: "android",
			spdx: "Apache-2.0",
			url: homepageOf(coordinate),
			texts: [
				"apache-2.0.txt" as const,
				androidNotices[coordinate],
			].filter((id) => id !== undefined),
		}),
	);

	return {
		entries: [...android, ...bundledOutsideNodeModules].map(
			({ texts: ids, ...entry }) => ({
				...entry,
				textHashes: ids.map(hashOf),
			}),
		),
		texts: Object.fromEntries(
			[...texts.values()].map((text) => [hashText(text), text]),
		),
	};
};
