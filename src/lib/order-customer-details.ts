type Fields = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** The order snapshot wins; saved shipping data only fills missing fields. */
export function orderCustomerDetails(ship: Fields, addresses: Fields[], profileDocument?: unknown) {
  const saved = addresses.find(a => a.purpose === "shipping") ?? addresses.find(a => a.purpose !== "billing");
  const shipping: Record<string, string> = {};
  for (const key of ["recipient", "email", "phone", "line1", "line2", "city", "department", "postal_code", "country"]) {
    shipping[key] = text(ship[key]) || text(saved?.[key]);
  }
  const billing = ship.billing && typeof ship.billing === "object" ? ship.billing as Fields : {};
  const document = text(ship.document_id) || text(ship.identification) || text(billing.document_id) || text(profileDocument);
  return { shipping, document };
}