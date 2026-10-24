// Profile IDs are sequential, so known (unix seconds, profile id) pairs date
// an account. Anchors from GrindrPlus's spline.json, plus later ones seen on
// profiles Grindr flagged as new.
const anchors: [number, number][] = [
	[1238563200, 0],
	[1285027200, 1000000],
	[1462924800, 35512000],
	[1501804800, 132076000],
	[1546547829, 201948000],
	[1618531200, 351220000],
	[1636150385, 390338000],
	[1637963460, 394800000],
	[1680393600, 505225000],
	[1717200000, 630495000],
	[1717372800, 634942000],
	[1729950240, 699724000],
	[1732986600, 710609000],
	[1733349060, 711676000],
	[1735229820, 718934000],
	[1738065780, 730248000],
	[1739059200, 733779000],
	[1741564800, 744008000],
	[1792800000, 929630535], // 2026-10-24
];

/** Estimated account creation date; newer ids extend the last segment, capped at `now`. */
export function estimateAccountCreation(
	profileId: number,
	now = Date.now(),
): Date {
	let i = anchors.findIndex(([, id]) => id >= profileId);
	if (i === 0) return new Date(anchors[0]![0] * 1000);
	if (i === -1) i = anchors.length - 1;
	const [t0, id0] = anchors[i - 1]!;
	const [t1, id1] = anchors[i]!;
	const seconds = t0 + ((profileId - id0) * (t1 - t0)) / (id1 - id0);
	return new Date(Math.min(seconds * 1000, now));
}
