import { test, expect } from "@playwright/test";
import { login, ALUMNO } from "./fixtures";

async function getDbHandles() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });
  const [{ db }, schema, { eq, and }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const schemaExports = (schema as Record<string, unknown>).default ?? schema;
  return { db, eq, and, ...(schemaExports as typeof schema) };
}

test.describe("aula del alumno", () => {
  let enrollmentId: string | undefined;
  let materialId: string | undefined;
  let sessionId: string | undefined;

  test.afterAll(async () => {
    if (!enrollmentId && !materialId) return;
    const { db, eq, sessionAttendance, sessionMaterials, enrollments } = await getDbHandles();
    if (enrollmentId) await db.delete(sessionAttendance).where(eq(sessionAttendance.enrollmentId, enrollmentId));
    if (materialId) await db.delete(sessionMaterials).where(eq(sessionMaterials.id, materialId));
    if (enrollmentId) await db.delete(enrollments).where(eq(enrollments.id, enrollmentId));
  });

  test("un alumno inscrito ve su agenda, entra a una sesión, la marca y descarga un material", async ({ page }) => {
    const { db, eq, and, user, courses, classSessions, sessionMaterials, enrollments } = await getDbHandles();

    const [alumno] = await db.select({ id: user.id }).from(user).where(eq(user.email, ALUMNO.email)).limit(1);
    const [curso] = await db.select({ id: courses.id, slug: courses.slug })
      .from(courses).where(eq(courses.slug, "excel-desde-cero")).limit(1);
    const [primeraSesion] = await db.select({ id: classSessions.id, title: classSessions.title })
      .from(classSessions).where(eq(classSessions.courseId, curso.id)).orderBy(classSessions.orderIndex).limit(1);
    sessionId = primeraSesion.id;

    const [existing] = await db.select({ id: enrollments.id }).from(enrollments)
      .where(and(eq(enrollments.userId, alumno.id), eq(enrollments.courseId, curso.id))).limit(1);
    if (existing) {
      enrollmentId = existing.id;
      await db.update(enrollments).set({ status: "active" }).where(eq(enrollments.id, existing.id));
    } else {
      const [created] = await db.insert(enrollments)
        .values({ userId: alumno.id, courseId: curso.id, status: "active" })
        .returning({ id: enrollments.id });
      enrollmentId = created.id;
    }

    const [material] = await db.insert(sessionMaterials)
      .values({ classSessionId: primeraSesion.id, title: "Guía de práctica", externalUrl: "https://drive.google.com/practica" })
      .returning({ id: sessionMaterials.id });
    materialId = material.id;

    await login(page, ALUMNO.email, ALUMNO.password);

    await page.goto("/mi-aprendizaje");
    await expect(page.getByText("Excel desde cero")).toBeVisible();

    await page.getByText("Excel desde cero").click();
    await expect(page).toHaveURL(`/curso/${curso.slug}/aprender`);
    await expect(page.getByText(primeraSesion.title)).toBeVisible();

    await page.getByText(primeraSesion.title).click();
    await expect(page).toHaveURL(`/curso/${curso.slug}/aprender/${primeraSesion.id}`);
    await expect(page.getByText("Guía de práctica", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: /marcar como/i }).click();
    await expect(page.getByText(/ya marcaste esta sesión/i)).toBeVisible();
  });
});
