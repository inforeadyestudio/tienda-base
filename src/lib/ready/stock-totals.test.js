import { test, expect } from "vitest";
import { stockTotals } from "./stock-totals";
test("suma disponible por bodega exacto (Jaguar Sky Bogotá = 6)", () => {
  const r = [[5,3],[3,2],[3,1],[1,0]].map(([o,re])=>({location:"Tienda Bogotá",on_hand:o,reserved:re,available:o-re}));
  expect(stockTotals(r)).toEqual([{location:"Tienda Bogotá",on_hand:12,reserved:6,available:6}]);
});
