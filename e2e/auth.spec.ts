import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Autenticación y RBAC", () => {
  test("una ruta protegida redirige a /login sin sesión", async ({ page }) => {
    await page.goto("/almacen");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login correcto lleva a dashboards", async ({ page }) => {
    await login(page);
    await expect(
      page.getByRole("heading", { name: "Dashboards" }),
    ).toBeVisible();
  });

  test("credenciales incorrectas muestran error y no autentican", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("input#email").fill("admin@luvi2000.es");
    await page.locator("input#password").fill("contraseña-mala");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Credenciales incorrectas/i)).toBeVisible();
  });

  test("el OPERARIO no ve el enlace de Configuración (RBAC)", async ({
    page,
  }) => {
    await login(page, "laura@luvi2000.es", "operario123");
    // El operario tiene navegación reducida.
    await expect(page.getByRole("link", { name: "Configuración" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: "Recepciones" })).toBeVisible();
  });
});
