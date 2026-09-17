package org.regrind.update

import android.Manifest
import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.SigningInfo
import android.os.Build
import java.io.File
import java.security.MessageDigest

data class PackageState(
	val versionName: String?,
	val versionCode: Long,
)

object InstallProbe {
	fun verdictFor(
		context: Context,
		target: String,
	): InstallGate.Verdict = InstallGate.decide(
		signerSha256 = soleSignerOf(installedSigningInfo(context)),
		target = target,
		targetSigner = InstallGate.TargetSigner.of(
			context.packageManager.checkSignatures(context.packageName, target),
		),
		installer = { installerOf(context, target) },
		updateOwner = { updateOwnerOf(context, target) },
		self = context.packageName,
	)

	fun stateOf(
		context: Context,
		packageName: String,
	): PackageState? = infoOf(context, packageName)?.let { info ->
		PackageState(versionName = info.versionName, versionCode = versionCodeOf(info))
	}

	fun canInstallNow(context: Context): Boolean =
		infoOf(context, context.packageName, PackageManager.GET_PERMISSIONS)
			?.requestedPermissions
			?.contains(Manifest.permission.REQUEST_INSTALL_PACKAGES) == true &&
			context.packageManager.canRequestPackageInstalls()

	fun readArchive(
		context: Context,
		apk: File,
	): PackageInfo? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
		context.packageManager.getPackageArchiveInfo(
			apk.absolutePath,
			PackageManager.PackageInfoFlags.of(0L),
		)
	} else {
		@Suppress("DEPRECATION")
		context.packageManager.getPackageArchiveInfo(apk.absolutePath, 0)
	}

	fun soleSignerOf(signing: SigningInfo?): String? {
		if (signing == null || signing.hasMultipleSigners()) return null
		val signers = signing.apkContentsSigners ?: return null
		val sole = signers.singleOrNull() ?: return null
		return sha256Hex(sole.toByteArray())
	}

	private fun infoOf(
		context: Context,
		packageName: String,
		flags: Int = 0,
	): PackageInfo? = try {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			context.packageManager.getPackageInfo(
				packageName,
				PackageManager.PackageInfoFlags.of(flags.toLong()),
			)
		} else {
			@Suppress("DEPRECATION")
			context.packageManager.getPackageInfo(packageName, flags)
		}
	} catch (e: PackageManager.NameNotFoundException) {
		null
	}

	fun versionCodeOf(info: PackageInfo): Long =
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
			info.longVersionCode
		} else {
			@Suppress("DEPRECATION")
			info.versionCode.toLong()
		}

	private fun installedSigningInfo(context: Context): SigningInfo? =
		infoOf(context, context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)?.signingInfo

	private fun installerOf(
		context: Context,
		packageName: String,
	): String? = try {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
			context.packageManager.getInstallSourceInfo(packageName).installingPackageName
		} else {
			@Suppress("DEPRECATION")
			context.packageManager.getInstallerPackageName(packageName)
		}
	} catch (e: PackageManager.NameNotFoundException) {
		null
	} catch (e: IllegalArgumentException) {
		null
	}

	private fun updateOwnerOf(
		context: Context,
		packageName: String,
	): String? = try {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
			context.packageManager.getInstallSourceInfo(packageName).updateOwnerPackageName
		} else {
			null
		}
	} catch (e: PackageManager.NameNotFoundException) {
		null
	} catch (e: IllegalArgumentException) {
		null
	}

	private fun sha256Hex(der: ByteArray): String =
		MessageDigest.getInstance("SHA-256").digest(der).joinToString("") { byte ->
			"%02X".format(byte)
		}
}
