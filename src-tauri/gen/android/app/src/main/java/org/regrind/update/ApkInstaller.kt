package org.regrind.update

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import java.io.File

class InstallRefused(val marker: String) : Exception(marker)

object ApkInstaller {
	private const val ENTRY = "base.apk"
	private const val BUFFER = 1 shl 16
	const val EXTRA_INSTALL_TARGET = "org.opengrind.update.extra.INSTALL_TARGET"

	private val live = LiveSession()

	fun isLive(sessionId: Int): Boolean = live.isLive(sessionId)

	fun installPending(context: Context): Boolean {
		val sessionId = live.current() ?: return false
		return context.packageManager.packageInstaller.getSessionInfo(sessionId) != null
	}

	fun install(
		context: Context,
		apk: File,
		target: String,
	) {
		if (!apk.isFile || apk.length() == 0L) throw InstallRefused("missing")
		val staged = context.cacheDir.canonicalFile
		if (!apk.canonicalFile.toPath().startsWith(staged.toPath())) {
			throw InstallRefused("foreign-path")
		}
		when (InstallProbe.verdictFor(context, target)) {
			is InstallGate.Verdict.Supported -> {}
			is InstallGate.Verdict.ExternallyManaged -> throw InstallRefused("externally-managed")
			is InstallGate.Verdict.ForeignSigner -> throw InstallRefused("foreign-signer")
			is InstallGate.Verdict.ForeignTarget -> throw InstallRefused("foreign-target")
		}
		if (!InstallProbe.canInstallNow(context)) throw InstallRefused("unknown-sources")

		val archive = InstallProbe.readArchive(context, apk) ?: throw InstallRefused("unreadable")
		if (archive.packageName != target) throw InstallRefused("package-mismatch")
		val installedCode = InstallProbe.stateOf(context, target)?.versionCode
		if (!InstallGate.mayReplace(installedCode, InstallProbe.versionCodeOf(archive))) {
			throw InstallRefused("downgrade")
		}

		val installer = context.packageManager.packageInstaller
		abandonAll(context)

		val total = apk.length()
		val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
			.apply {
				setAppPackageName(target)
				setSize(total)
				setInstallReason(PackageManager.INSTALL_REASON_USER)
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
					setPackageSource(PackageInstaller.PACKAGE_SOURCE_STORE)
				}
			}

		val sessionId = installer.createSession(params)
		live.claim(sessionId)
		try {
			installer.openSession(sessionId).use { session ->
				session.openWrite(ENTRY, 0, total).use { output ->
					apk.inputStream().use { input -> input.copyTo(output, BUFFER) }
					session.fsync(output)
				}
				if (replacesThisApp(context, target)) UpdateLedger.forgetOutcome(context)
				session.commit(statusSender(context, sessionId, target))
			}
		} catch (e: Throwable) {
			live.release()
			runCatching { installer.abandonSession(sessionId) }
			throw e
		}
	}

	fun replacesThisApp(
		context: Context,
		target: String,
	): Boolean = target == context.packageName

	fun abandonAll(context: Context) {
		live.release()
		val installer = context.packageManager.packageInstaller
		installer.mySessions.forEach { session ->
			runCatching { installer.abandonSession(session.sessionId) }
		}
	}

	// targetSdk 35+ rejects an immutable PendingIntent
	private fun statusSender(
		context: Context,
		sessionId: Int,
		target: String,
	): IntentSender {
		val intent = Intent(context, InstallResultReceiver::class.java)
			.putExtra(EXTRA_INSTALL_TARGET, target)
		var flags = PendingIntent.FLAG_UPDATE_CURRENT
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
			flags = flags or PendingIntent.FLAG_MUTABLE
		}
		return PendingIntent
			.getBroadcast(context.applicationContext, sessionId, intent, flags)
			.intentSender
	}
}
