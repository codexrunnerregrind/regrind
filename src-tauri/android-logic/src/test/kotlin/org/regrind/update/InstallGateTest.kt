package org.regrind.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InstallGateTest {
	private val releaseCert = InstallGate.RELEASE_CERT_SHA256
	private val self = "org.regrind"
	private val addon = "org.opengrind.google_oauth"

	private fun decide(
		signerSha256: String? = releaseCert,
		target: String = self,
		targetSigner: InstallGate.TargetSigner = InstallGate.TargetSigner.Shared,
		installer: String? = null,
		updateOwner: String? = null,
	): InstallGate.Verdict = InstallGate.decide(
		signerSha256 = signerSha256,
		target = target,
		targetSigner = targetSigner,
		installer = { installer },
		updateOwner = { updateOwner },
		self = self,
	)

	private val ownerProbeOfAnAbsentPackage: () -> String? = {
		throw IllegalArgumentException("Unknown package")
	}

	@Test
	fun `a sideloaded release build may update itself`() {
		assertEquals(
			InstallGate.Verdict.Supported,
			decide(),
		)
	}

	@Test
	fun `an install from a browser or file manager still updates itself`() {
		assertEquals(
			InstallGate.Verdict.Supported,
			decide(installer = "com.android.chrome"),
		)
	}

	@Test
	fun `an f-droid install stands down`() {
		val verdict = decide(installer = "org.fdroid.fdroid")
		assertEquals(InstallGate.Verdict.ExternallyManaged("org.fdroid.fdroid"), verdict)
	}

	@Test
	fun `every known store and updater stands down`() {
		for (installer in InstallGate.EXTERNAL_UPDATERS) {
			assertEquals(
				InstallGate.Verdict.ExternallyManaged(installer),
				decide(installer = installer),
			)
		}
	}

	@Test
	fun `another app owning updates stands down even when the installer is unknown`() {
		assertEquals(
			InstallGate.Verdict.ExternallyManaged("com.example.store"),
			decide(updateOwner = "com.example.store"),
		)
	}

	@Test
	fun `owning our own updates is not external`() {
		assertEquals(
			InstallGate.Verdict.Supported,
			decide(updateOwner = self),
		)
	}

	@Test
	fun `a build signed by anyone else can never update itself`() {
		val debugCert = "A".repeat(64)
		assertEquals(
			InstallGate.Verdict.ForeignSigner,
			decide(signerSha256 = debugCert),
		)
		assertEquals(
			InstallGate.Verdict.ForeignSigner,
			decide(signerSha256 = null),
		)
	}

	@Test
	fun `the signer check runs before the installer check`() {
		assertEquals(
			InstallGate.Verdict.ForeignSigner,
			decide(signerSha256 = "A".repeat(64), installer = "org.fdroid.fdroid"),
		)
	}

	@Test
	fun `a matching signature check means the target is signed like us`() {
		assertEquals(
			InstallGate.TargetSigner.Shared,
			InstallGate.TargetSigner.of(InstallGate.SIGNATURE_MATCH),
		)
	}

	@Test
	fun `a target the signature check cannot find is not installed`() {
		assertEquals(
			InstallGate.TargetSigner.NotInstalled,
			InstallGate.TargetSigner.of(InstallGate.SIGNATURE_UNKNOWN_PACKAGE),
		)
	}

	@Test
	fun `every other signature check result is foreign`() {
		for (mismatch in listOf(1, -1, -2, -3)) {
			assertEquals(
				InstallGate.TargetSigner.Foreign,
				InstallGate.TargetSigner.of(mismatch),
			)
		}
	}

	@Test
	fun `an add-on signed by someone else is never replaced`() {
		assertEquals(
			InstallGate.Verdict.ForeignTarget,
			decide(target = addon, targetSigner = InstallGate.TargetSigner.Foreign),
		)
	}

	@Test
	fun `an add-on signed like us may be replaced`() {
		assertEquals(
			InstallGate.Verdict.Supported,
			decide(target = addon, targetSigner = InstallGate.TargetSigner.Shared),
		)
	}

	@Test
	fun `an add-on that is not installed yet may be installed`() {
		assertEquals(
			InstallGate.Verdict.Supported,
			decide(target = addon, targetSigner = InstallGate.TargetSigner.NotInstalled),
		)
	}

	@Test
	fun `an add-on that is not installed yet is never probed for its owner`() {
		assertEquals(
			InstallGate.Verdict.Supported,
			InstallGate.decide(
				signerSha256 = releaseCert,
				target = addon,
				targetSigner = InstallGate.TargetSigner.NotInstalled,
				installer = ownerProbeOfAnAbsentPackage,
				updateOwner = ownerProbeOfAnAbsentPackage,
				self = self,
			),
		)
	}

	@Test
	fun `an installed add-on is still probed for the store that owns it`() {
		assertEquals(
			InstallGate.Verdict.ExternallyManaged("com.example.store"),
			decide(
				target = addon,
				targetSigner = InstallGate.TargetSigner.Shared,
				updateOwner = "com.example.store",
			),
		)
	}

	@Test
	fun `the target signer check never applies to this app itself`() {
		assertEquals(
			InstallGate.Verdict.Supported,
			decide(target = self, targetSigner = InstallGate.TargetSigner.Foreign),
		)
	}

	@Test
	fun `our own foreign signer outranks a foreign add-on`() {
		assertEquals(
			InstallGate.Verdict.ForeignSigner,
			decide(
				signerSha256 = "A".repeat(64),
				target = addon,
				targetSigner = InstallGate.TargetSigner.Foreign,
			),
		)
	}

	@Test
	fun `a foreign add-on outranks the store that owns it`() {
		assertEquals(
			InstallGate.Verdict.ForeignTarget,
			decide(
				target = addon,
				targetSigner = InstallGate.TargetSigner.Foreign,
				installer = "org.fdroid.fdroid",
				updateOwner = "com.example.store",
			),
		)
	}

	@Test
	fun `a store-owned add-on signed like us still stands down`() {
		assertEquals(
			InstallGate.Verdict.ExternallyManaged("org.fdroid.fdroid"),
			decide(
				target = addon,
				targetSigner = InstallGate.TargetSigner.Shared,
				installer = "org.fdroid.fdroid",
			),
		)
	}

	@Test
	fun `certificate comparison is exact`() {
		assertTrue(InstallGate.matchesReleaseCert(releaseCert))
		assertFalse(InstallGate.matchesReleaseCert(releaseCert.lowercase()))
		assertFalse(InstallGate.matchesReleaseCert(releaseCert.dropLast(1)))
		assertFalse(InstallGate.matchesReleaseCert(""))
	}

	@Test
	fun `reinstalling the same version code is allowed`() {
		assertTrue(InstallGate.mayReplace(installedCode = 42L, archiveCode = 42L))
	}

	@Test
	fun `upgrading to a higher version code is allowed`() {
		assertTrue(InstallGate.mayReplace(installedCode = 42L, archiveCode = 43L))
	}

	@Test
	fun `downgrading to a lower version code is refused`() {
		assertFalse(InstallGate.mayReplace(installedCode = 42L, archiveCode = 41L))
	}

	@Test
	fun `a package that is not installed has nothing to downgrade`() {
		assertTrue(InstallGate.mayReplace(installedCode = null, archiveCode = 1L))
	}
}
