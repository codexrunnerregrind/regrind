import { formatDate } from "#lib/i18n/format.ts";
import { t } from "#lib/i18n/index.ts";

export function formatMediaDuration(seconds: number) {
	const total =
		Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
	const minutes = Math.floor(total / 60);
	const paddedSeconds = String(total % 60).padStart(2, "0");
	if (minutes < 60) return `${minutes}:${paddedSeconds}`;
	const paddedMinutes = String(minutes % 60).padStart(2, "0");
	return `${Math.floor(minutes / 60)}:${paddedMinutes}:${paddedSeconds}`;
}

export function formatTimeRelativeCustom(date: number) {
	if (date < 0) return "";
	const diff = Date.now() - date;
	if (diff < 60 * 1000) return t("common.time.justNow");
	else if (diff < 60 * 60 * 1000) {
		const count = Math.floor(diff / (60 * 1000));
		return t("common.time.minutes", { count });
	} else if (diff < 24 * 60 * 60 * 1000) {
		const count = Math.floor(diff / (60 * 60 * 1000));
		return t("common.time.hours", { count });
	} else if (diff < 2 * 24 * 60 * 60 * 1000)
		return t("common.time.yesterday");
	else if (diff < 7 * 24 * 60 * 60 * 1000)
		return formatDate({ date, preset: "weekday" });
	else return formatDate({ date, preset: "monthDay" });
}

export function formatTimeAgoShort(date: number, now: number) {
	const mins = Math.max(1, Math.floor((now - date) / (60 * 1000)));
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	if (days < 7) return `${days}d ago`;
	return `${Math.floor(days / 7)}w ago`;
}
