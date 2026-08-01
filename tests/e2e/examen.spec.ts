import { test, expect } from "@playwright/test";
import { login, ALUMNO, PROF } from "./fixtures";

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

test.describe("examen", () => {
  let enrollmentId: string | undefined;
  let examId: string | undefined;
  let creamosLaInscripcion = false;

  test.afterAll(async () => {
    const { db, eq, exams, enrollments, examAttempts } = await getDbHandles();
    if (enrollmentId) {
      await db.delete(examAttempts).where(eq(examAttempts.enrollmentId, enrollmentId));
    }
    // questions, question_options y exam_attempt_* caen por ON DELETE CASCADE del examen.
    if (examId) await db.delete(exams).where(eq(exams.id, examId));
    if (enrollmentId && creamosLaInscripcion) {
      await db.delete(enrollments).where(eq(enrollments.id, enrollmentId));
    }
  });

  test("el instructor arma el examen y el alumno lo rinde y aprueba", async ({ page }) => {
    const { db, eq, and, user, courses, enrollments, exams } = await getDbHandles();

    const [alumno] = await db.select({ id: user.id }).from(user)
      .where(eq(user.email, ALUMNO.email)).limit(1);
    const [curso] = await db.select({ id: courses.id, slug: courses.slug })
      .from(courses).where(eq(courses.slug, "excel-desde-cero")).limit(1);

    // Estado limpio: este curso no debe arrastrar un examen de una corrida anterior.
    await db.delete(exams).where(eq(exams.courseId, curso.id));

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
      creamosLaInscripcion = true;
    }

    // ---------------------------------------------------------------- instructor
    await login(page, PROF.email, PROF.password);
    await page.goto("/instructor");
    await page.getByRole("link", { name: /editar/i }).first().click();
    await page.getByRole("link", { name: "Examen" }).click();
    await expect(page).toHaveURL(/\/instructor\/cursos\/.+\/examen$/);

    await page.getByLabel("Título del examen").fill("Examen de Excel");
    await page.getByLabel("Nota de aprobación (%)").fill("50");
    await page.getByLabel(/barajar el orden de las opciones/i).uncheck();
    await page.getByRole("button", { name: /guardar configuración/i }).click();
    await expect(page.getByRole("heading", { name: "Banco de preguntas" })).toBeVisible();

    await page.getByLabel("Enunciado").fill("¿Excel es una hoja de cálculo?");
    await page.getByPlaceholder("Opción 1").fill("Sí");
    await page.getByPlaceholder("Opción 2").fill("No");
    await page.getByRole("button", { name: /agregar pregunta/i }).click();
    await expect(page.getByText("¿Excel es una hoja de cálculo?")).toBeVisible();

    await page.getByRole("button", { name: /publicar examen/i }).click();
    await expect(page.getByText("Publicado")).toBeVisible();

    const [ex] = await db.select({ id: exams.id }).from(exams)
      .where(eq(exams.courseId, curso.id)).limit(1);
    examId = ex.id;

    // -------------------------------------------------------------------- alumno
    await login(page, ALUMNO.email, ALUMNO.password);
    await page.goto(`/curso/${curso.slug}/aprender`);
    await page.getByRole("link", { name: /rendir el examen/i }).click();
    await expect(page).toHaveURL(`/curso/${curso.slug}/examen`);
    await expect(page.getByText(/necesitas 50% para aprobar/i)).toBeVisible();

    await page.getByRole("button", { name: /iniciar examen/i }).click();
    await expect(page).toHaveURL(/\/examen\/[0-9a-f-]+$/);

    // Invariante: la página del intento no revela la respuesta correcta.
    const html = await page.content();
    expect(html).not.toContain("isCorrect");

    await page.getByRole("radio").first().check();
    await expect(page.getByText("✓ guardado")).toBeVisible();

    await page.getByRole("button", { name: /enviar examen/i }).click();
    await expect(page).toHaveURL(/\/resultado$/);
    await expect(page.getByText("100%")).toBeVisible();
    await expect(page.getByText("Aprobado")).toBeVisible();
    await expect(page.getByText(/certificado estará disponible pronto/i)).toBeVisible();
  });
});
