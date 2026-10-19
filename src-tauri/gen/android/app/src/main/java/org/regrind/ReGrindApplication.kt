package org.regrind

import android.app.Application
import io.crates.keyring.Keyring

class ReGrindApplication : Application() {
	override fun onCreate() {
		super.onCreate()
		Keyring.initializeNdkContext(this)
	}
}
