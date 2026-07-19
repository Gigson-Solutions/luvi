import { type Page, expect } from "@playwright/test";

/** Inicia sesión por la UI. */
export async function login(
  page: Page,
  email = "admin@luvi2000.es",
  password = "admin123",
): Promise<void> {
  await page.goto("/login");
  await page.locator("input#email").fill(email);
  await page.locator("input#password").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Admin/gestión → /dashboards; operario → /operario. Solo exigimos salir de /login.
  await expect(page).toHaveURL(/\/(dashboards|operario)/, { timeout: 20_000 });
}
