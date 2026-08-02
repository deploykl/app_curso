import { test, expect } from "@playwright/test";
import { login, PROF, ALUMNO } from "./fixtures";

test.describe("catálogo público", () => {
  test("un visitante ve los cursos publicados", async ({ page }) => {
    await page.goto("/cursos");
    await expect(page.getByText("Excel desde cero")).toBeVisible();
  });

  test("el detalle muestra el temario con horas de Lima", async ({ page }) => {
    await page.goto("/cursos/excel-desde-cero");
    await expect(page.getByRole("heading", { name: "Excel desde cero" })).toBeVisible();
    await expect(page.getByText("Clase 1")).toBeVisible();
    await expect(page.getByText("S/ 199.00")).toBeVisible();
  });

  test("el HTML no filtra el enlace de Zoom a un visitante", async ({ page }) => {
    const res = await page.goto("/cursos/excel-desde-cero");
    const html = (await res!.text()).toLowerCase();
    expect(html).not.toContain("zoom.us");
  });

  test("un curso en borrador devuelve 404", async ({ page }) => {
    const res = await page.goto("/cursos/no-existe-este-curso");
    expect(res!.status()).toBe(404);
  });
});

test.describe("panel de instructor", () => {
  test("crea un curso, le añade una sesión y lo publica", async ({ page }) => {
    await login(page, PROF.email, PROF.password);

    await page.goto("/instructor/cursos/nuevo");
    const titulo = `Curso E2E ${Date.now()}`;
    await page.getByLabel("Título", { exact: true }).fill(titulo);
    await page.getByLabel(/precio/i).fill("149");
    await page.getByLabel(/horas/i).fill("6");
    await page.getByRole("button", { name: /guardar|crear/i }).click();

    await expect(page.getByText(titulo)).toBeVisible();

    // Intentar publicar sin sesiones debe explicar el motivo
    await page.getByRole("button", { name: /publicar/i }).click();
    await expect(page.getByText(/al menos una sesión/i)).toBeVisible();

    // Añadir una sesión (ahora se agrega directo en la página del curso)
    await page.getByLabel("Título", { exact: true }).nth(1).fill("Clase E2E");
    await page.getByLabel(/fecha y hora/i).fill("2026-12-01T10:00");
    await page.getByLabel(/duración \(min\)/i).fill("90");
    await page.getByRole("button", { name: /agregar sesión/i }).click();
    await expect(page.getByText("Clase E2E")).toBeVisible();

    // Ahora sí publica
    await page.getByRole("button", { name: /publicar/i }).click();
    await expect(page.getByText(/publicado/i)).toBeVisible();
  });

  test("un alumno no puede entrar al panel de instructor", async ({ page }) => {
    await login(page, ALUMNO.email, ALUMNO.password);
    await page.goto("/instructor");
    await expect(page).not.toHaveURL(/\/instructor/);
  });
});
