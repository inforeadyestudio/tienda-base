import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), sign: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({
  inputValidator: (validate) => ({
    handler: (handler) => (input) => handler({ data: validate(input.data) }),
  }),
}) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  storage: { from: () => ({ createSignedUrls: mocks.sign }) },
} }));
import { approvedReviewMedia } from "./review-media.functions";

const productId = "11111111-1111-4111-8111-111111111111";
function query(result) {
  const q = { select: vi.fn(() => q), eq: vi.fn(() => q), order: vi.fn(() => q),
    limit: vi.fn(async () => result), maybeSingle: vi.fn(async () => result) };
  return q;
}
describe("approved review media authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test"; });
  it("rejects invalid product IDs before querying", async () => {
    await expect(async () => approvedReviewMedia({ data: { productId: "../private" } })).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not sign files for a product invisible to public readers", async () => {
    mocks.from.mockReturnValue(query({ data: null, error: null }));
    expect(await approvedReviewMedia({ data: { productId } })).toEqual([]);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("signs only server-selected approved paths, with short expiry", async () => {
    const product = query({ data: { id: productId }, error: null });
    const reviews = query({ data: [{ id: "review", photo_urls: ["owner/photo.webp", "../private", "https://example.com/file"], video_url: null }], error: null });
    mocks.from.mockReturnValueOnce(product).mockReturnValueOnce(reviews);
    mocks.sign.mockResolvedValue({ data: [{ signedUrl: "https://example.com/signed" }], error: null });
    expect(await approvedReviewMedia({ data: { productId } })).toEqual([{ reviewId: "review", kind: "photo", url: "https://example.com/signed" }]);
    expect(product.eq).toHaveBeenCalledWith("status", "published");
    expect(reviews.eq).toHaveBeenCalledWith("approved", true);
    expect(mocks.sign).toHaveBeenCalledWith(["owner/photo.webp"], 900);
  });
});