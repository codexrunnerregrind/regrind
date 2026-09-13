package org.regrind.update

import android.content.pm.PackageManager
import org.junit.Assert.assertEquals
import org.junit.Test

class MirroredSignatureTest {
	@Test
	fun `every mirrored signature check result matches the platform`() {
		assertEquals(PackageManager.SIGNATURE_MATCH, InstallGate.SIGNATURE_MATCH)
		assertEquals(
			PackageManager.SIGNATURE_UNKNOWN_PACKAGE,
			InstallGate.SIGNATURE_UNKNOWN_PACKAGE,
		)
	}

	@Test
	fun `every platform signature mismatch reads as a foreign target`() {
		for (mismatch in listOf(
			PackageManager.SIGNATURE_NEITHER_SIGNED,
			PackageManager.SIGNATURE_FIRST_NOT_SIGNED,
			PackageManager.SIGNATURE_SECOND_NOT_SIGNED,
			PackageManager.SIGNATURE_NO_MATCH,
		)) {
			assertEquals(
				InstallGate.TargetSigner.Foreign,
				InstallGate.TargetSigner.of(mismatch),
			)
		}
	}
}
