import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const E2E_DB = "postgresql://luvi:luvi@localhost:5433/luvi_e2e?schema=public";

// e2e contra un servidor y BD dedicados (no toca el dev en :3000 ni la BD luvi).
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  webServer: {
    command: "pnpm dev",
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      DATABASE_URL: E2E_DB,
      NEXTAUTH_URL: `http://localhost:${PORT}`,
      NEXTAUTH_SECRET: "e2e-secret-local",
      AUTH_SECRET: "e2e-secret-local",
      AUTH_TRUST_HOST: "true",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
