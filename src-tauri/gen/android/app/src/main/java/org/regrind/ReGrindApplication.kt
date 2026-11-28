package org.regrind

import android.app.Application
import io.crates.keyring.Keyring
import org.regrind.recaptcha.MintTokenActivity

class ReGrindApplication : Application() {
	private val mintsRecaptcha by lazy { getProcessName().endsWith(MintTokenActivity.PROCESS_SUFFIX) }

	override fun onCreate() {
		super.onCreate()
		if (!mintsRecaptcha) Keyring.initializeNdkContext(this)
	}

	// The reCAPTCHA SDK identifies the app by this name; see MintTokenActivity.
	override fun getPackageName(): String =
		if (mintsRecaptcha) MintTokenActivity.GRINDR_PACKAGE else super.getPackageName()
}
