package org.opengrind.addon

import org.opengrind.update.InstallGate

object AddonGate {
	private val releaseCertSha256: ByteArray = InstallGate.RELEASE_CERT_SHA256
		.chunked(2)
		.map { pair -> pair.toInt(16).toByte() }
		.toByteArray()

	fun interface SigningCertificates {
		fun has(packageName: String, sha256: ByteArray): Boolean
	}

	enum class Presence {
		Absent,
		Disabled,
		Enabled,
	}

	enum class Verdict {
		Launch,
		Unavailable,
		Disabled,
		Untrusted,
	}

	fun decide(
		addonPackage: String,
		resolves: Boolean,
		presence: Presence,
		certificates: SigningCertificates,
	): Verdict = when {
		(resolves || presence != Presence.Absent) && !releaseSigned(addonPackage, certificates) -> Verdict.Untrusted
		!resolves && presence == Presence.Disabled -> Verdict.Disabled
		!resolves -> Verdict.Unavailable
		else -> Verdict.Launch
	}

	fun acceptsCaller(
		callingPackage: String?,
		addonPackage: String,
		certificates: SigningCertificates,
	): Boolean = callingPackage == addonPackage && releaseSigned(addonPackage, certificates)

	private fun releaseSigned(addonPackage: String, certificates: SigningCertificates): Boolean =
		certificates.has(packageName = addonPackage, sha256 = releaseCertSha256)
}
