// The public origin. Invite links are copied into DMs and posted publicly, so
// they must always point at production, never at a dev/tunnel origin the
// recipient cannot reach.
export const SITE = "skycave.space";

/** Full shareable URL for a room. */
export const roomUrl = (code: string) => `https://${SITE}/room/${code}`;

/** Same link without the scheme, for display in tight UI. */
export const roomUrlDisplay = (code: string) => `${SITE}/room/${code}`;

/** Full shareable URL for a series. */
export const seriesUrl = (code: string) => `https://${SITE}/series/${code}`;

/** Series link without the scheme, for display in tight UI. */
export const seriesUrlDisplay = (code: string) => `${SITE}/series/${code}`;
