package org.regrind.update

enum class TransferTitle {
	AppUpdate,
	GoogleOauthInstall,
	GoogleOauthUpdate,
	RecaptchaInstall,
	RecaptchaUpdate,
	;

	enum class Addon {
		GoogleOauth,
		Recaptcha,
	}

	companion object {
		private const val FIRST_INSTALL = "install"

		fun of(
			updatesThisApp: Boolean,
			addon: Addon?,
			kind: String?,
		): TransferTitle {
			if (updatesThisApp || addon == null) return AppUpdate
			val firstInstall = kind == FIRST_INSTALL
			return when (addon) {
				Addon.GoogleOauth -> if (firstInstall) GoogleOauthInstall else GoogleOauthUpdate
				Addon.Recaptcha -> if (firstInstall) RecaptchaInstall else RecaptchaUpdate
			}
		}

		fun named(name: String?): TransferTitle = entries.firstOrNull { it.name == name } ?: AppUpdate
	}
}
