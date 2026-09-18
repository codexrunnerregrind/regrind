package org.regrind.push

import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PushCredentialsTest {
	private val appId = "1:1036042917246:android:93d3725a6ad2a74d"
	private val apiKey = "AIzaSyDummyKeyForTests"
	private val projectId = "api-project-1036042917246"
	private val senderId = "1036042917246"
	private val cert = "3082058730820".padEnd(512, 'a')

	private fun reason(
		appId: String = this.appId,
		apiKey: String = this.apiKey,
		projectId: String = this.projectId,
		senderId: String = this.senderId,
		certHex: String = cert,
	) = PushCredentials.invalidReason(appId, apiKey, projectId, senderId, certHex)

	@Test
	fun `accepts the real credentials`() {
		assertNull(reason())
	}

	@Test
	fun `rejects the app id read as a certificate`() {
		// The exact stale-resource failure: grindr_cert resolved to fcm_google_app_id.
		val why = reason(certHex = appId)
		assertTrue(why, why?.startsWith("grindr_cert is not a certificate") == true)
	}

	@Test
	fun `rejects a certificate read as the app id`() {
		val why = reason(appId = cert)
		assertTrue(why, why?.startsWith("fcm_google_app_id is not an app id") == true)
	}

	@Test
	fun `rejects a sender id that is not a number`() {
		val why = reason(senderId = "api-project-1036042917246")
		assertTrue(why, why?.startsWith("fcm_gcm_defaultSenderId is not numeric") == true)
	}

	@Test
	fun `rejects blank values`() {
		assertTrue(reason(apiKey = " ")?.contains("api_key") == true)
		assertTrue(reason(projectId = "")?.contains("project_id") == true)
	}

	@Test
	fun `keeps a credential out of the message it logs`() {
		val why = reason(certHex = appId) ?: ""
		assertTrue(why, !why.contains("93d3725a6ad2a74d"))
	}

	@Test
	fun `rejects an odd length certificate`() {
		val why = reason(certHex = cert.dropLast(1))
		assertTrue(why, why?.contains("odd length") == true)
	}
}
