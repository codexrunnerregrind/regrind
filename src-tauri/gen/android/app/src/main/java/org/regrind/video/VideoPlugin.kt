package org.regrind.video

import android.app.Activity
import android.net.Uri
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.common.collect.ImmutableList

@InvokeArg
class TranscodeArgs {
    lateinit var input: String
    lateinit var output: String
}

/**
 * Re-encodes a picked clip to something the chat API will accept: a few seconds
 * off a phone camera is tens of megabytes at 4K, and the endpoint answers
 * an oversized one with a bare 413; 15 MB has been refused.
 *
 * The iOS counterpart is `src-tauri/native/VideoTranscode.m`, which goes
 * through AVAssetExportSession instead. Both aim at 720p H.264 in MP4.
 */
@UnstableApi
@TauriPlugin
class VideoPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun transcode(invoke: Invoke) {
        val args = invoke.parseArgs(TranscodeArgs::class.java)

        // Transformer insists on the main thread for its callbacks, and the Rust
        // side is already waiting on a blocking task.
        activity.runOnUiThread {
            try {
                start(args, invoke)
            } catch (error: Throwable) {
                invoke.reject(error.message ?: ERROR_FAILED)
            }
        }
    }

    private fun start(args: TranscodeArgs, invoke: Invoke) {
        // `input` is whatever the picker handed the frontend: a content:// URI
        // on Android, which Transformer resolves itself.
        val item = MediaItem.fromUri(Uri.parse(args.input))
        val edited = EditedMediaItem.Builder(item)
            .setEffects(
                Effects(
                    /* audioProcessors = */ ImmutableList.of(),
                    // Bounds the long edge; a clip already smaller than this is
                    // left at its own size rather than blown up.
                    ImmutableList.of<Effect>(
                        Presentation.createForHeight(SHORT_SIDE),
                    ),
                ),
            )
            .build()

        Transformer.Builder(activity)
            .setVideoMimeType(VIDEO_MIME)
            .setAudioMimeType(AUDIO_MIME)
            .addListener(
                object : Transformer.Listener {
                    override fun onCompleted(
                        composition: Composition,
                        result: ExportResult,
                    ) {
                        invoke.resolve(JSObject().put("ok", true))
                    }

                    override fun onError(
                        composition: Composition,
                        result: ExportResult,
                        exception: ExportException,
                    ) {
                        invoke.reject(exception.message ?: ERROR_FAILED)
                    }
                },
            )
            .build()
            .start(edited, args.output)
    }

    private companion object {
        const val SHORT_SIDE = 720
        const val VIDEO_MIME = "video/avc"
        const val AUDIO_MIME = "audio/mp4a-latm"
        const val ERROR_FAILED = "video-transcode-failed"
    }
}
