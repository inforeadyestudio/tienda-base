export const LIVE_VISITORS_CHANNEL = "storefront-active-visitors";

/** Only public storefront routes contribute; staff portals never count. */
export function isStorefrontVisitorPath(path: string): boolean {
  return !/^\/(admin|pos|auth|b2b|api)(\/|$)/.test(path);
}

/** Presence keys identify browsers, not tabs; never expose customer identities. */
export function countLiveVisitors(state: Record<string, { active?: boolean }[]>): number {
  return Object.values(state).filter((entries) => entries.some((entry) => entry.active === true)).length;
}