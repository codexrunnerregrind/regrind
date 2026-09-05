package org.regrind.update

object InstallGate {
	const val RELEASE_CERT_SHA256 =
		"0266C7BF4936BE5F94E96870755F5003C85EA27997098100BBCD55CA264E3940"

	val EXTERNAL_UPDATERS = setOf(
		"org.fdroid.fdroid",
		"org.fdroid.fdroid.privileged",
		"org.fdroid.basic",
		"com.looker.droidify",
		"com.machiav3lli.fdroid",
		"dev.imranr.obtainium",
		"dev.imranr.obtainium.fdroid",
		"com.aurora.store",
		"com.android.vending",
	)

	sealed interface Verdict {
		data object Supported : Verdict

		data class ExternallyManaged(val installer: String) : Verdict

		data object ForeignSigner : Verdict
	}

	fun decide(
		signerSha256: String?,
		installer: String?,
		updateOwner: String?,
		self: String,
	): Verdict {
		if (signerSha256 == null || !matchesReleaseCert(signerSha256)) {
			return Verdict.ForeignSigner
		}
		if (updateOwner != null && updateOwner != self) {
			return Verdict.ExternallyManaged(updateOwner)
		}
		if (installer != null && installer in EXTERNAL_UPDATERS) {
			return Verdict.ExternallyManaged(installer)
		}
		return Verdict.Supported
	}

	fun matchesReleaseCert(fingerprint: String): Boolean =
		constantTimeEquals(fingerprint, RELEASE_CERT_SHA256)

	fun mayReplace(
		installedCode: Long,
		archiveCode: Long,
	): Boolean = archiveCode >= installedCode

	private fun constantTimeEquals(
		left: String,
		right: String,
	): Boolean {
		if (left.length != right.length) return false
		var difference = 0
		for (index in left.indices) {
			difference = difference or (left[index].code xor right[index].code)
		}
		return difference == 0
	}
}
