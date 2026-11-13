export type PackLine = { variantId: string; qty: number; sku: string | null; barcode: string | null; [k: string]: unknown };
export const PACK_VERIFY_REQUIRED_FROM: Date;
export function packVerifyRequired(now?: Date): boolean;
export function matchScan(lines: PackLine[], counts: Record<string, number>, code: string): { ok: boolean; variantId?: string; reason?: "empty" | "not_in_order" | "excess" };
export function isComplete(lines: PackLine[], counts: Record<string, number>): boolean;
export function mergeLines<T extends PackLine>(lines: T[]): T[];
