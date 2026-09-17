package org.opengrind.addon

import android.content.pm.PackageManager

fun PackageManager.signingCertificates() =
	AddonGate.SigningCertificates { packageName, sha256 ->
		hasSigningCertificate(packageName, sha256, PackageManager.CERT_INPUT_SHA256)
	}
