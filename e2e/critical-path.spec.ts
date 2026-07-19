import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Flujo de negocio completo, encadenado, sobre datos del seed e2e.
test("camino crítico: recepción → almacén → producción → expedición → trazabilidad", async ({
  page,
}) => {
  const ref = `E2E-${Date.now()}`;
  let firstQr = "";

  await login(page);

  await test.step("Recepción: registrar contenedor", async () => {
    await page.goto("/recepciones");
    await page.getByRole("button", { name: "Registrar contenedor" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("input#reference").fill(ref);
    await dlg
      .locator("select#supplierId")
      .selectOption({ label: "Proveedor ES Ejemplo" });
    await dlg
      .locator("select#materialId")
      .selectOption({ label: "Pellet PE Natural" });
    await dlg.locator("input#expectedWeight").fill("8000");
    await dlg.locator("input#numSacks").fill("8");
    await dlg.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("cell", { name: ref })).toBeVisible();
  });

  await test.step("Recepción: pesar y generar 8 sacas", async () => {
    await page
      .getByRole("row", { name: new RegExp(ref) })
      .getByRole("button", { name: "Pesar y recibir" })
      .click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("input#actualWeight").fill("7960");
    await dlg
      .locator("select#materialId")
      .selectOption({ label: "Pellet PE Natural" });
    await dlg
      .locator("select#zoneId")
      .selectOption({ label: "Planta Montalbos · Zona A — MP" });
    await dlg.locator("input#numSacks").fill("8");
    await dlg.getByRole("button", { name: "Confirmar recepción" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Aparece en "Recibidos recientemente"
    await expect(page.getByRole("cell", { name: ref }).first()).toBeVisible();
  });

  await test.step("Almacén: las sacas están en stock", async () => {
    await page.goto("/almacen");
    // Al menos una saca del material esperado, con QR
    const firstQrLink = page.getByRole("link", { name: /^SACK-/ }).first();
    await expect(firstQrLink).toBeVisible();
    firstQr = (await firstQrLink.textContent())?.trim() ?? "";
    expect(firstQr).toMatch(/^SACK-/);
  });

  await test.step("Producción: entrada a tolva + saca de Producto Terminado", async () => {
    await page.goto("/produccion");
    // Entrar a tolva la primera saca disponible
    const tolvaBtn = page
      .getByRole("button", { name: "Entrar a tolva" })
      .first();
    await tolvaBtn.click();
    await page.waitForTimeout(1000);
    // Crear saca de salida (Producto Terminado)
    await page.getByRole("button", { name: "Saca de salida" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("select#type").selectOption("PRODUCTO_TERMINADO");
    await dlg
      .locator("select#materialId")
      .selectOption({ label: "Pellet PE Natural" });
    await dlg.locator("input#weight").fill("900");
    // Zona destino (primera zona real)
    await dlg.locator("select#zoneId").selectOption({ index: 1 });
    await dlg.getByRole("button", { name: "Crear saca" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  await test.step("Expedición: crear envío, confirmar y expedir", async () => {
    await page.goto("/expediciones");
    await page.getByRole("button", { name: "Nuevo envío" }).click();
    const dlg = page.getByRole("dialog");
    await dlg
      .locator("select#buyerId")
      .selectOption({ label: "Comprador Ejemplo ES" });
    // Seleccionar el lote PT disponible (primer option real) + kg + añadir
    await dlg.getByLabel("Lote").selectOption({ index: 1 });
    await dlg.locator('input[placeholder="kg"]').fill("900");
    await dlg.getByRole("button", { name: "Añadir" }).click();
    await dlg.getByRole("button", { name: "Crear envío" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Confirmar y luego Expedir el envío recién creado (primera fila)
    await page.getByRole("button", { name: "Confirmar" }).first().click();
    await expect(
      page.getByRole("button", { name: "Expedir" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Expedir" }).first().click();
    // El envío queda Expedido
    await expect(page.getByText("Expedido").first()).toBeVisible();
  });

  await test.step("Trazabilidad: la saca rastrea hasta su proveedor", async () => {
    await page.goto("/trazabilidad");
    await page.getByPlaceholder(/QR o ID de saca/i).fill(firstQr);
    await page.getByPlaceholder(/QR o ID de saca/i).press("Enter");
    // La cadena hacia atrás muestra el proveedor de origen
    await expect(page.getByText(/Proveedor ES Ejemplo/i).first()).toBeVisible();
  });
});
