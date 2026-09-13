package org.regrind.update

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller

class InstallResultReceiver : android.content.BroadcastReceiver() {
	private val hiddenPackageManagerStatusExtra =
		"android.content.pm.extra.LEGACY_STATUS"

	override fun onReceive(
		context: Context,
		intent: Intent,
	) {
		val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
		val packageManagerStatus =
			intent.getIntExtra(hiddenPackageManagerStatusExtra, 0)
		val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
		val sessionId = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1)
		val live = ApkInstaller.isLive(sessionId)
		val target = intent.getStringExtra(ApkInstaller.EXTRA_INSTALL_TARGET) ?: context.packageName

		if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
			if (live) confirmationIntent(intent)?.let(PendingConfirmation::offer)
			return
		}
		if (ApkInstaller.replacesThisApp(context, target)) {
			UpdateLedger.record(
				context = context,
				status = status,
				packageManagerStatus = packageManagerStatus,
				message = message,
			)
		}
		if (live) {
			InstallEvents.deliver(
				InstallStatus.outcomeOf(
					status = status,
					packageManagerStatus = packageManagerStatus,
					message = message,
					packageName = target,
				),
			)
		}
	}

	private fun confirmationIntent(intent: Intent): Intent? =
		if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
			intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
		} else {
			@Suppress("DEPRECATION")
			intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
		}
}

object PendingConfirmation : Handoff<Intent>()
