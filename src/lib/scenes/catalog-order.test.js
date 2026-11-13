import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { catalogOrderIds } from "./catalog-order.ts";

const scene = (props, visible = true) => ({ id: "order", type: "catalog-order", source: "library", position: 3, visible, props, layers: [] });

describe("live catalog order", () => {
  it("follows collection sequence without duplicating shared products", () => {
    assert.deepEqual(catalogOrderIds([scene({ mode: "collections", collectionSlugs: ["sombra", "orquideana"] })], { sombra: ["c", "a"], orquideana: ["a", "b"] }), ["c", "a", "b"]);
  });
  it("reflects a reordered draft collection sequence", () => {
    assert.deepEqual(catalogOrderIds([scene({ mode: "collections", collectionSlugs: ["orquideana", "sombra"] })], { sombra: ["c", "a"], orquideana: ["b"] }), ["b", "c", "a"]);
  });
  it("preserves manual product order", () => {
    assert.deepEqual(catalogOrderIds([scene({ mode: "manual", productIds: ["b", "a", "b"] })]), ["b", "a"]);
  });
  it("ignores hidden or absent order settings", () => {
    assert.equal(catalogOrderIds([scene({ mode: "manual", productIds: ["b"] }, false)]), null);
    assert.equal(catalogOrderIds([]), null);
  });
});