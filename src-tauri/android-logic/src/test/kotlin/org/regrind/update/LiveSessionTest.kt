package org.regrind.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveSessionTest {
	private val session = LiveSession()

	@Test
	fun `no session is live until one is created`() {
		assertFalse(session.isLive(1))
		assertFalse(session.isLive(Int.MAX_VALUE))
	}

	@Test
	fun `a broadcast without a session id is never ours`() {
		session.claim(-1)

		assertFalse(
			"an absent EXTRA_SESSION_ID must not match, even after a claim",
			session.isLive(-1),
		)
	}

	@Test
	fun `only the claimed session is live`() {
		session.claim(4242)

		assertTrue(session.isLive(4242))
		assertFalse(session.isLive(4243))
	}

	@Test
	fun `releasing makes the last session stale`() {
		session.claim(4242)
		session.release()

		assertFalse(
			"an abandoned session must not answer for the next one",
			session.isLive(4242),
		)
	}

	@Test
	fun `no session is current until one is created`() {
		assertNull(session.current())
	}

	@Test
	fun `the claimed session is current`() {
		session.claim(4242)

		assertEquals(4242, session.current())
	}

	@Test
	fun `a released session is no longer current`() {
		session.claim(4242)
		session.release()

		assertNull(
			"a finished install must not read as still pending",
			session.current(),
		)
	}

	@Test
	fun `a claim without a session id holds nothing`() {
		session.claim(-1)

		assertNull(session.current())
	}
}

