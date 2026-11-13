import { describe, expect, it } from "vitest";
import { normalizePortalStats } from "./portal-stats";

describe("portal stats RPC response", () => {
  const totals = { events: 508, accounts: 19, sessions: 55 };
  const sections = [{ visits: 272, section: "resumen", accounts: 19 }, { visits: 56, section: "pedidos", accounts: 13 }];
  const registered = { total_accounts: 3816 };
  const expected = { ...totals, ...registered, sections };

  it("reads the actual split response without discarding accounts or section visits", () => {
    expect(normalizePortalStats([totals, ...sections, registered])).toEqual(expected);
  });

  it("also accepts the single-object JSON response", () => {
    expect(normalizePortalStats(expected)).toEqual(expected);
  });

  it("keeps registered accounts when the selected period has no visits", () => {
    expect(normalizePortalStats([{ accounts: 0, sessions: 0, events: 0 }, registered]))
      .toEqual({ accounts: 0, sessions: 0, events: 0, total_accounts: 3816, sections: [] });
  });
});