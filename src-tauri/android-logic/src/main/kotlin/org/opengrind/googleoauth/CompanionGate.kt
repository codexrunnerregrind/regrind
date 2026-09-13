package org.opengrind.googleoauth

object CompanionGate {
	enum class Presence {
		Absent,
		Disabled,
		Enabled,
	}

	enum class Verdict {
		Launch,
		Unavailable,
		Disabled,
		Untrusted,
	}

	fun decide(
		resolves: Boolean,
		presence: Presence,
		signatureMatches: Boolean,
	): Verdict = when {
		presence != Presence.Absent && !signatureMatches -> Verdict.Untrusted
		!resolves && presence == Presence.Disabled -> Verdict.Disabled
		!resolves -> Verdict.Unavailable
		else -> Verdict.Launch
	}
}
