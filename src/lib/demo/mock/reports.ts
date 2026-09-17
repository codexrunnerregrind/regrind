type DemoSubmittedReport = { createTime: number };

const profileReports = new Map<number, DemoSubmittedReport>();
const rightNowPostReports = new Map<number, DemoSubmittedReport>();

export function demoProfileReport(
	profileId: number,
): DemoSubmittedReport | null {
	return profileReports.get(profileId) ?? null;
}

export function demoReportProfile(profileId: number): void {
	profileReports.set(profileId, { createTime: Date.now() });
}

export function demoRightNowPostReport(
	postId: number,
): DemoSubmittedReport | null {
	return rightNowPostReports.get(postId) ?? null;
}

export function demoReportRightNowPost(postId: number): void {
	rightNowPostReports.set(postId, { createTime: Date.now() });
}
