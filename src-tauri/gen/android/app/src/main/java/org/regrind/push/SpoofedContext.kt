package org.regrind.push

import android.app.Application
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import org.regrind.R

// Grindr's FCM sender only pushes to a client that looks like the official app.
// This context reports Grindr's package name to Firebase's identity checks (and
// nothing else) and hands Firebase a package manager that returns Grindr's
// signing certificate. Used solely to initialise FirebaseApp.
//
// It subclasses Application (attaching the real base context) rather than a bare
// ContextWrapper: FirebaseMessaging registers lifecycle callbacks against its
// context and warns "was not an application ... some notification events may be
// dropped" for anything else.
class SpoofedContext(base: Context) : Application() {
	init {
		attachBaseContext(base)
	}

	private val spoofedPackageManager by lazy {
		SpoofedPackageManager(
			baseContext.packageManager,
			baseContext.packageName,
			getString(R.string.grindr_cert),
		)
	}

	override fun getApplicationContext(): Context = this

	override fun getPackageName(): String {
		if (calledByFirebaseIdentity()) return SpoofedPackageManager.GRINDR_PACKAGE
		return baseContext.packageName
	}

	override fun getApplicationInfo(): ApplicationInfo {
		val info = super.getApplicationInfo()
		if (calledByFirebaseIdentity()) info.packageName = SpoofedPackageManager.GRINDR_PACKAGE
		return info
	}

	override fun getPackageManager(): PackageManager = spoofedPackageManager

	// Only spoof for Firebase's installation/messaging identity lookups —
	// ComponentDiscovery and the rest need our real package name to work.
	private fun calledByFirebaseIdentity(): Boolean =
		Thread.currentThread().stackTrace.any {
			it.className.contains("FirebaseInstallationServiceClient") ||
				it.className.contains("com.google.firebase.messaging.Metadata") ||
				it.className.contains("FirebaseMessaging")
		}
}
