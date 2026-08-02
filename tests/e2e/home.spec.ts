import { test, expect } from "@playwright/test";

test.describe("landing", () => {
  test("muestra el hero y navega al catálogo", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /certifícate de verdad/i
    );

    await page.getByRole("link", { name: /^ver cursos$/i }).click();
    await expect(page).toHaveURL(/\/cursos$/);
  });

  test("renderiza todas las secciones del landing", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /de la primera clase/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /tu empleador/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /ya se certificaron/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /suelen preguntarnos/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /próxima clase en vivo/i })
    ).toBeVisible();
  });

  test("el toggle alterna el tema en el <html>", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);

    await page.getByRole("button", { name: /tema claro y oscuro/i }).click();
    await expect(html).toHaveClass(/dark/);

    await page.reload();
    await expect(html).toHaveClass(/dark/);

    await page.getByRole("button", { name: /tema claro y oscuro/i }).click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test("el FAQ despliega la respuesta", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: /si no tengo tarjeta de crédito/i });
    await trigger.click();
    await expect(page.getByText(/subes la captura de tu operación/i)).toBeVisible();
  });

  test("el formulario de verificación lleva al certificado", async ({ page }) => {
    // En dev, la primera navegación a /verificar/[code] paga la compilación de
    // la ruta; con el servidor recién arrancado puede pasar de los 30 s por defecto.
    test.slow();
    await page.goto("/");

    await page.getByLabel(/código del certificado/i).fill("abcd-1234");
    await page.getByRole("button", { name: /verificar certificado/i }).click();

    // Margen amplio: en dev la ruta /verificar/[code] se compila bajo demanda y
    // el router no cambia la URL hasta que recibe la respuesta del servidor.
    await expect(page).toHaveURL(/\/verificar\/ABCD-1234$/, { timeout: 60_000 });
    await expect(page.getByText(/no encontramos ningún certificado/i)).toBeVisible();
  });

  test("la verificación funciona como GET, sin depender del JS", async ({ page }) => {
    // Mismo camino que sigue el formulario antes de hidratar o con JS desactivado.
    await page.goto("/verificar?codigo=abcd-1234");
    await expect(page).toHaveURL(/\/verificar\/ABCD-1234$/);
    await expect(page.getByText(/no encontramos ningún certificado/i)).toBeVisible();
  });

  test("sin animaciones el contenido sigue siendo visible", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /ya se certificaron/i })).toBeVisible();
    await expect(page.getByText(/Rosa Quispe$/)).toBeVisible();
  });
});
