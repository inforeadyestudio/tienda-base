import { fileURLToPath } from "node:url";

// Test server authorization directly, without replacing handlers with SSR RPC stubs.
export default {
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/lib/review-media.functions.test.js"] },
};