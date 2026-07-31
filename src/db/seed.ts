import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, instructorProfiles, categories, courses, classSessions, paymentDestinations } from "@/db/schema";
import { auth } from "@/lib/auth";

const CATEGORIAS = [
  { slug: "ofimatica", name: "Ofimática", orderIndex: 1 },
  { slug: "diseno", name: "Diseño", orderIndex: 2 },
  { slug: "negocios", name: "Negocios", orderIndex: 3 },
];

async function upsertUser(email: string, name: string, password: string, role: string) {
  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existing.length) return existing[0];

  await auth.api.signUpEmail({ body: { email, password, name } });
  await db.update(user).set({ role, emailVerified: true }).where(eq(user.email, email));
  const [u] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  return u;
}

async function main() {
  for (const c of CATEGORIAS) {
    await db.insert(categories).values(c).onConflictDoNothing({ target: categories.slug });
  }

  const admin = await upsertUser("admin@test.pe", "Admin General", "admin12345", "admin");
  const prof = await upsertUser("prof@test.pe", "Ana Instructora", "prof12345", "instructor");
  await upsertUser("alumno@test.pe", "Luis Alumno", "alumno12345", "student");

  await db.insert(instructorProfiles).values({
    userId: prof.id,
    displayName: "Ana Instructora",
    headline: "Especialista en Excel",
    commissionRate: "30.00",
    status: "approved",
  }).onConflictDoNothing();

  const [cat] = await db.select().from(categories).where(eq(categories.slug, "ofimatica")).limit(1);

  const existing = await db.select().from(courses).where(eq(courses.slug, "excel-desde-cero")).limit(1);
  if (!existing.length) {
    const [curso] = await db.insert(courses).values({
      instructorId: prof.id,
      categoryId: cat.id,
      slug: "excel-desde-cero",
      title: "Excel desde cero",
      subtitle: "Domina las hojas de cálculo en 4 clases en vivo",
      descriptionMd: "Curso práctico con clases en vivo por Zoom y materiales descargables.",
      level: "basico",
      priceCents: 19900,
      estimatedHours: "8.00",
      status: "published",
      publishedAt: new Date(),
    }).returning();

    const base = Date.now() + 7 * 86_400_000;
    for (let i = 0; i < 4; i++) {
      await db.insert(classSessions).values({
        courseId: curso.id,
        orderIndex: i,
        title: `Clase ${i + 1}`,
        startsAt: new Date(base + i * 7 * 86_400_000),
        durationMinutes: 90,
        zoomUrl: `https://zoom.us/j/00000000${i}`,
        isFreePreview: i === 0,
      });
    }
  }

  const existingDestinations = await db.select().from(paymentDestinations).limit(1);
  if (existingDestinations.length === 0) {
    await db.insert(paymentDestinations).values([
      {
        method: "yape", holderName: "Academia Demo", identifier: "987654321",
        instructionsMd: "Escanea el QR o yapea al número indicado.",
        isActive: true, orderIndex: 1,
      },
      {
        method: "plin", holderName: "Academia Demo", identifier: "987654321",
        instructionsMd: "Plinea al número indicado y guarda tu comprobante.",
        isActive: true, orderIndex: 2,
      },
      {
        method: "transferencia", holderName: "Academia Demo SAC", identifier: "00219800123456789012",
        bankName: "BCP", instructionsMd: "Transfiere por CCI y anota el número de operación.",
        isActive: true, orderIndex: 3,
      },
    ]);
  }

  console.log("Seed listo. admin@test.pe / prof@test.pe / alumno@test.pe — contraseñas: <rol>12345");
  process.exit(0);
}

main();
