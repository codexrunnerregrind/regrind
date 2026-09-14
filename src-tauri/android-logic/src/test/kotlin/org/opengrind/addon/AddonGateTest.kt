package org.opengrind.addon

import org.junit.Assert.assertEquals
import org.junit.Test

class AddonGateTest {
	@Test
	fun `a trusted add-on that answers the request is launched`() {
		assertEquals(
			AddonGate.Verdict.Launch,
			AddonGate.decide(
				resolves = true,
				presence = AddonGate.Presence.Enabled,
				signatureMatches = true,
			),
		)
	}

	@Test
	fun `a missing add-on is unavailable`() {
		assertEquals(
			AddonGate.Verdict.Unavailable,
			AddonGate.decide(
				resolves = false,
				presence = AddonGate.Presence.Absent,
				signatureMatches = false,
			),
		)
	}

	@Test
	fun `a turned off add-on is reported as disabled rather than missing`() {
		assertEquals(
			AddonGate.Verdict.Disabled,
			AddonGate.decide(
				resolves = false,
				presence = AddonGate.Presence.Disabled,
				signatureMatches = true,
			),
		)
	}

	@Test
	fun `an enabled add-on that does not answer the request is unavailable`() {
		assertEquals(
			AddonGate.Verdict.Unavailable,
			AddonGate.decide(
				resolves = false,
				presence = AddonGate.Presence.Enabled,
				signatureMatches = true,
			),
		)
	}

	@Test
	fun `an enabled add-on signed by someone else that does not answer is untrusted`() {
		assertEquals(
			AddonGate.Verdict.Untrusted,
			AddonGate.decide(
				resolves = false,
				presence = AddonGate.Presence.Enabled,
				signatureMatches = false,
			),
		)
	}

	@Test
	fun `an add-on signed by someone else is untrusted`() {
		assertEquals(
			AddonGate.Verdict.Untrusted,
			AddonGate.decide(
				resolves = true,
				presence = AddonGate.Presence.Enabled,
				signatureMatches = false,
			),
		)
	}

	@Test
	fun `a disabled add-on signed by someone else is untrusted, never a prompt to turn it on`() {
		assertEquals(
			AddonGate.Verdict.Untrusted,
			AddonGate.decide(
				resolves = false,
				presence = AddonGate.Presence.Disabled,
				signatureMatches = false,
			),
		)
	}
}
