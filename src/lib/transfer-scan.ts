import { normalizeScannedCode } from "./scanned-code";

export type TransferScanLine = { variantId: string; qty: number };

export function matchesTransferCode(variant: { sku: string; barcode?: string | null }, raw: string) {
  const code = normalizeScannedCode(raw);
  return !!code && (normalizeScannedCode(variant.sku) === code ||
    (!!variant.barcode && normalizeScannedCode(variant.barcode) === code));
}

export function addTransferScan<T extends TransferScanLine>(lines: T[], item: T): T[] {
  const existing = lines.find((line) => line.variantId === item.variantId);
  return existing
    ? lines.map((line) => line.variantId === item.variantId ? { ...line, qty: line.qty + item.qty } : line)
    : [...lines, item];
}