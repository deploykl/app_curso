import { test, expect } from "@playwright/test";
import { login, ALUMNO } from "./fixtures";

const ADMIN = { email: "admin@test.pe", password: "admin12345" };

// Playwright ejecuta este archivo con Node "puro" (no pasa por `next dev`,
// que es lo único que carga .env.local automáticamente en el resto del
// proyecto), así que sin este paso `@/db` se conecta con una URL vacía.
// Se cargan las variables y se importa la app de base de datos de forma
// perezosa (dynamic import) para garantizar que el .env ya esté poblado
// antes de que `src/db/index.ts` lea `process.env.DATABASE_URL`.
async function getDbHandles() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });
  const [{ db }, schema, { eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  // El transform de dynamic-import de Playwright envuelve el módulo CJS
  // compilado en un objeto { default, ... } en vez de exponer los exports
  // nombrados directamente; hay que desenvolverlo.
  const schemaExports = (schema as Record<string, unknown>).default ?? schema;
  return { db, eq, ...(schemaExports as typeof schema) };
}

test.describe("compra con pago manual", () => {
  let createdOrderId: string | undefined;

  test.afterAll(async () => {
    // El test aprueba una orden real (inscribe al alumno y genera earnings de
    // verdad), así que hay que revertirlo para que una corrida posterior de
    // `pnpm test:e2e` sobre la misma BD no falle con "Ya estás inscrito en
    // este curso." Orden seguro para FKs: earnings/enrollment -> proofs ->
    // order_items -> orders. Mismo estilo de limpieza que
    // tests/integration/order-expiry.test.ts y billing-proof.test.ts.
    if (!createdOrderId) return;
    const { db, eq, orders, orderItems, paymentProofs, enrollments, instructorEarnings } = await getDbHandles();
    const [item] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, createdOrderId));
    if (item) await db.delete(instructorEarnings).where(eq(instructorEarnings.orderItemId, item.id));
    await db.delete(enrollments).where(eq(enrollments.orderId, createdOrderId));
    await db.delete(paymentProofs).where(eq(paymentProofs.orderId, createdOrderId));
    await db.delete(orderItems).where(eq(orderItems.orderId, createdOrderId));
    await db.delete(orders).where(eq(orders.id, createdOrderId));
  });

  test("un alumno compra, sube comprobante, y el admin lo aprueba", async ({ page, context }) => {
    // Este entorno de desarrollo no tiene credenciales reales de Cloudflare R2
    // (ver .env.local: R2_ACCOUNT_ID vacío), así que la URL presignada que
    // genera el backend no apunta a un bucket real y el PUT del navegador
    // fallaría por DNS. Se intercepta solo esa llamada de terceros para
    // simular un upload exitoso; todo lo demás (creación de la orden,
    // validación del formulario, persistencia del comprobante en la BD, y
    // la aprobación del admin) sigue corriendo contra la app y la BD reales.
    await page.route("**.r2.cloudflarestorage.com/**", (route) =>
      route.fulfill({ status: 200, body: "" })
    );

    await login(page, ALUMNO.email, ALUMNO.password);

    await page.goto("/cursos/excel-desde-cero");
    // La Fase 2 no agrega un botón de compra a la página de curso todavía
    // (eso es UI de catálogo, Fase 1); se navega directo a crear la orden
    // vía la Server Action expuesta en /pago tras un helper de test.
    const res = await page.request.post("/api/test-only/crear-orden", {
      data: { courseSlug: "excel-desde-cero" },
    });
    expect(res.ok()).toBe(true);
    const { orderNumber } = await res.json();
    const { db, eq, orders } = await getDbHandles();
    const [createdOrder] = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, orderNumber));
    createdOrderId = createdOrder?.id;

    await page.goto(`/pago/${orderNumber}`);
    await expect(page.getByText(orderNumber)).toBeVisible();
    await expect(page.getByText("Excel desde cero")).toBeVisible();

    await page.getByLabel("Nombre del titular").fill("Alumno Prueba");
    await page.getByLabel("DNI").fill("12345678");
    await page.getByLabel(/operación/i).fill("OP-E2E-1");
    await page.getByLabel(/monto/i).fill("199");
    await page.getByLabel(/fecha y hora/i).fill("2026-08-01T10:00");
    await page.setInputFiles("#proof-file", {
      name: "comprobante.png", mimeType: "image/png",
      buffer: Buffer.from("fake-image-content"),
    });

    // El widget de Turnstile carga su script y resuelve el token de forma
    // asíncrona (usa las llaves dummy oficiales de Cloudflare en .env.local,
    // que auto-aprueban sin interacción real, pero toman uno o dos segundos
    // en cargar). Esperamos a que inyecte su input oculto con el token antes
    // de enviar, para no adelantarnos al callback de React.
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /enviar comprobante/i }).click();
    await expect(page.getByText(/comprobante enviado/i)).toBeVisible();

    const adminPage = await context.newPage();
    await login(adminPage, ADMIN.email, ADMIN.password);
    await adminPage.goto("/admin/pagos");
    await expect(adminPage.getByText(orderNumber)).toBeVisible();
    await adminPage.getByRole("button", { name: /^aprobar$/i }).click();
    await expect(adminPage.getByText(/aprobada/i)).toBeVisible();
  });
});
