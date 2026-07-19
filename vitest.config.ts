import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    // Integración comparte una BD de test → los ficheros se ejecutan en serie.
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
