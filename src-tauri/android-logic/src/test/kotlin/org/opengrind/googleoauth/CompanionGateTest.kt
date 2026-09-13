package org.opengrind.googleoauth

import org.junit.Assert.assertEquals
import org.junit.Test

class CompanionGateTest {
	@Test
	fun `a trusted companion that answers the request is launched`() {
		assertEquals(
			CompanionGate.Verdict.Launch,
			CompanionGate.decide(
				resolves = true,
				presence = CompanionGate.Presence.Enabled,
				signatureMatches = true,
			),
		)
	}

	@Test
	fun `a missing companion is unavailable`() {
		assertEquals(
			CompanionGate.Verdict.Unavailable,
			CompanionGate.decide(
				resolves = false,
				presence = CompanionGate.Presence.Absent,
				signatureMatches = false,
			),
		)
	}

	@Test
	fun `a turned off companion is reported as disabled rather than missing`() {
		assertEquals(
			CompanionGate.Verdict.Disabled,
			CompanionGate.decide(
				resolves = false,
				presence = CompanionGate.Presence.Disabled,
				signatureMatches = true,
			),
		)
	}

	@Test
	fun `an enabled companion that does not answer the request is unavailable`() {
		assertEquals(
			CompanionGate.Verdict.Unavailable,
			CompanionGate.decide(
				resolves = false,
				presence = CompanionGate.Presence.Enabled,
				signatureMatches = true,
			),
		)
	}

	@Test
	fun `an enabled companion signed by someone else that does not answer is untrusted`() {
		assertEquals(
			CompanionGate.Verdict.Untrusted,
			CompanionGate.decide(
				resolves = false,
				presence = CompanionGate.Presence.Enabled,
				signatureMatches = false,
			),
		)
	}

	@Test
	fun `a companion signed by someone else is untrusted`() {
		assertEquals(
			CompanionGate.Verdict.Untrusted,
			CompanionGate.decide(
				resolves = true,
				presence = CompanionGate.Presence.Enabled,
				signatureMatches = false,
			),
		)
	}

	@Test
	fun `a disabled companion signed by someone else is untrusted, never a prompt to turn it on`() {
		assertEquals(
			CompanionGate.Verdict.Untrusted,
			CompanionGate.decide(
				resolves = false,
				presence = CompanionGate.Presence.Disabled,
				signatureMatches = false,
			),
		)
	}
}
