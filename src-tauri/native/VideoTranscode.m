// Re-encodes a picked clip to something the chat API will accept. A few seconds
// off a modern iPhone camera is tens of megabytes at 4K, and the endpoint
// answers an oversized one with a bare 413 — 15 MB has been refused and the
// real limit is unpublished — so the bytes have to come down before they go up.
// 720p H.264 is what the official client sends.
//
// Compiled into the Rust library by `build.rs` and called over FFI from
// `src/video.rs`, rather than added to the Xcode target: the Rust side links as
// a dylib, so a symbol living in the app target — which links afterwards —
// would not resolve. Keeping it here also spares the generated Xcode project,
// which `tauri ios build` rewrites on every run.
#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

// Status codes shared with the Rust side; keep them in step.
typedef NS_ENUM(int32_t, RegrindTranscodeStatus) {
	RegrindTranscodeOk = 0,
	RegrindTranscodeUnreadable = -1,
	RegrindTranscodeNoSession = -2,
	RegrindTranscodeFailed = -3,
};

// Every failure carries its own sentence back to the caller. A transcode can
// fail for half a dozen unrelated reasons — an unreadable path, a sandboxed
// file, a codec the exporter will not take — and a bare status code sends
// whoever is debugging it back to guessing.
static void regrind_report(NSString *message, char *out, size_t capacity) {
	if (out == NULL || capacity == 0) return;
	const char *text = message.UTF8String;
	strlcpy(out, text ? text : "", capacity);
}

// Presets in descending size, tried in turn until one lands under the target.
// A short clip clears the first; a long one keeps stepping down rather than
// being refused, since the limit is on the file, not on the picture.
//
// Built per call rather than as a file-scope array: the preset names are extern
// symbols resolved at load, which cannot initialise a static.
static NSArray<NSString *> *regrind_presets(void) {
	return @[
		AVAssetExportPreset1280x720,
		AVAssetExportPreset960x540,
		AVAssetExportPreset640x480,
	];
}

static long long regrind_file_size(NSURL *url) {
	NSNumber *size = nil;
	[url getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
	return size ? size.longLongValue : -1;
}

int32_t regrind_transcode_video(
	const char *inputPath,
	const char *outputPath,
	int64_t targetBytes,
	char *errorOut,
	size_t errorCapacity
) {
	@autoreleasepool {
		if (inputPath == NULL || outputPath == NULL) {
			regrind_report(@"no input or output path", errorOut, errorCapacity);
			return RegrindTranscodeUnreadable;
		}
		NSString *raw = [NSString stringWithUTF8String:inputPath];

		// The picker hands back a path on some routes and a file:// URL on
		// others; `fileURLWithPath:` on the latter yields a URL to a file named
		// "file:", which reads as an empty asset rather than as an error.
		NSURL *input = [raw hasPrefix:@"file://"]
			? [NSURL URLWithString:raw]
			: [NSURL fileURLWithPath:raw];
		NSURL *output =
			[NSURL fileURLWithPath:[NSString stringWithUTF8String:outputPath]];

		// A file chosen through the document picker lives outside the sandbox
		// and has to be opened for access first. Harmless where it does not
		// apply, which is why the result is not treated as a failure.
		BOOL scoped = [input startAccessingSecurityScopedResource];

		int32_t status = RegrindTranscodeFailed;
		AVURLAsset *asset = [AVURLAsset URLAssetWithURL:input options:nil];
		if ([[asset tracksWithMediaType:AVMediaTypeVideo] count] == 0) {
			regrind_report(
				[NSString
					stringWithFormat:@"no video track in %@", input.lastPathComponent],
				errorOut,
				errorCapacity
			);
			status = RegrindTranscodeUnreadable;
		} else {
			NSArray<NSString *> *compatible =
				[AVAssetExportSession exportPresetsCompatibleWithAsset:asset];
			NSFileManager *files = [NSFileManager defaultManager];
			status = RegrindTranscodeNoSession;
			regrind_report(
				@"this clip's format cannot be re-encoded on this device",
				errorOut,
				errorCapacity
			);

			for (NSString *preset in regrind_presets()) {
				if (![compatible containsObject:preset]) continue;

				AVAssetExportSession *session =
					[[AVAssetExportSession alloc] initWithAsset:asset
													 presetName:preset];
				if (session == nil) continue;

				// The exporter refuses to overwrite, and a previous pass may
				// have left a file here.
				[files removeItemAtURL:output error:nil];
				session.outputURL = output;
				session.outputFileType = AVFileTypeMPEG4;
				// Moves the moov atom to the front, so the recipient's player can
				// start on the first bytes instead of the last.
				session.shouldOptimizeForNetworkUse = YES;

				// Rust calls this from a blocking task, so waiting here costs
				// nothing that was not already going to wait.
				dispatch_semaphore_t done = dispatch_semaphore_create(0);
				[session exportAsynchronouslyWithCompletionHandler:^{
					dispatch_semaphore_signal(done);
				}];
				dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);

				if (session.status != AVAssetExportSessionStatusCompleted) {
					regrind_report(
						session.error.localizedDescription ?: @"export failed",
						errorOut,
						errorCapacity
					);
					status = RegrindTranscodeFailed;
					break;
				}

				status = RegrindTranscodeOk;
				long long produced = regrind_file_size(output);
				if (targetBytes <= 0 || produced < 0 || produced <= targetBytes) {
					break;
				}
				// Still too big: the next preset down gets a turn, and the last
				// one's output stands if none of them fit.
				regrind_report(
					[NSString
						stringWithFormat:@"smallest available quality still comes to %lld MB",
										 produced / (1024 * 1024)],
					errorOut,
					errorCapacity
				);
			}
		}

		if (scoped) [input stopAccessingSecurityScopedResource];
		return status;
	}
}
