export type BillingValueMode = "total" | "customs";

export function customsDifference(commercialValue: number, customsValue: number): number {
  if (!Number.isFinite(commercialValue) || commercialValue < 0) throw new Error("El valor total no es válido");
  if (!Number.isFinite(customsValue) || customsValue < 0) throw new Error("El valor de aduanas no es válido");
  if (customsValue > commercialValue) throw new Error("El valor de aduanas no puede superar el valor total");
  return commercialValue - customsValue;
}

export function distributeCustomsValue<T extends { commercialValue: number }>(items: T[], customsTotal: number): number[] {
  const commercialTotal = items.reduce((sum, item) => sum + item.commercialValue, 0);
  customsDifference(commercialTotal, customsTotal);
  if (!items.length) return [];
  if (commercialTotal <= 0) return items.map((_, index) => index === items.length - 1 ? customsTotal : 0);
  let assigned = 0;
  return items.map((item, index) => {
    const value = index === items.length - 1
      ? customsTotal - assigned
      : Math.round((customsTotal * item.commercialValue / commercialTotal) * 100) / 100;
    assigned += value;
    return value;
  });
}