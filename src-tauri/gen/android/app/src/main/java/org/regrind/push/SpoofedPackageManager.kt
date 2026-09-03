package org.regrind.push

import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature

// Firebase verifies the caller by looking up com.grindrapp.android's package
// info and signing certificate. Answer that one lookup with Grindr's real
// identity so FCM registration and message delivery accept us; everything else
// falls through to the real package manager.
class SpoofedPackageManager(
	base: PackageManager,
	private val basePackageName: String,
	private val grindrCertHex: String,
) : AbstractSpoofedPackageManager(base) {

	private val base = base

	@Suppress("DEPRECATION")
	override fun getPackageInfo(p0: String, p1: Int): PackageInfo {
		if (p0 == GRINDR_PACKAGE) {
			val info = base.getPackageInfo(basePackageName, p1)
			info.packageName = GRINDR_PACKAGE
			info.signatures = arrayOf(Signature(decodeHex(grindrCertHex)))
			return info
		}
		return base.getPackageInfo(p0, p1)
	}

	override fun getApplicationInfo(p0: String, p1: Int): ApplicationInfo =
		base.getApplicationInfo(p0, p1)

	private fun decodeHex(hex: String): ByteArray {
		val cleaned = hex.trim().replace(" ", "").replace("\n", "")
		require(cleaned.length % 2 == 0) { "grindr_cert hex must have an even length" }
		return cleaned.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
	}

	companion object {
		const val GRINDR_PACKAGE = "com.grindrapp.android"
	}
}
