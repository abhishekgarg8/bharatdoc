import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "@bharatdoc/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "server-only": fileURLToPath(new URL("test/server-only.ts", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"]
  }
});
