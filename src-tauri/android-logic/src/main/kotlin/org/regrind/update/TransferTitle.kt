package org.regrind.update

enum class TransferTitle {
	AppUpdate,
	AddonInstall,
	AddonUpdate,
	;

	companion object {
		private const val FIRST_INSTALL = "install"

		fun of(
			updatesThisApp: Boolean,
			kind: String?,
		): TransferTitle =
			when {
				updatesThisApp -> AppUpdate
				kind == FIRST_INSTALL -> AddonInstall
				else -> AddonUpdate
			}

		fun named(name: String?): TransferTitle = entries.firstOrNull { it.name == name } ?: AppUpdate
	}
}
