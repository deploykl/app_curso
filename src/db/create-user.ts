/**
 * Crea (o actualiza) un usuario con un rol concreto.
 *
 *   pnpm user:crear <email> <password> "<nombre>" <student|instructor|admin>
 *
 * Si el usuario ya existe: actualiza el rol, marca el email como verificado y
 * reemplaza la contraseña. Si el rol es instructor o admin, además le crea un
 * perfil de instructor aprobado para que pueda armar cursos.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { user, account, instructorProfiles } from "@/db/schema";
import { auth } from "@/lib/auth";

const ROLES = ["student", "instructor", "admin"] as const;
type Role = (typeof ROLES)[number];

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

async function setPassword(userId: string, password: string) {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  await db
    .update(account)
    .set({ password: hash })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
}

async function main() {
  const [email, password, name, role] = process.argv.slice(2);

  if (!email || !password || !name || !role) {
    console.error(
      'Uso: pnpm user:crear <email> <password> "<nombre>" <student|instructor|admin>'
    );
    process.exit(1);
  }
  if (!isRole(role)) {
    console.error(`Rol inválido: "${role}". Debe ser uno de: ${ROLES.join(", ")}.`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);

  if (existing) {
    await db
      .update(user)
      .set({ name, role, emailVerified: true })
      .where(eq(user.id, existing.id));
    await setPassword(existing.id, password);
    console.log(`Usuario actualizado: ${email} (rol: ${role}, contraseña reemplazada)`);
  } else {
    await auth.api.signUpEmail({ body: { email, password, name } });
    await db.update(user).set({ role, emailVerified: true }).where(eq(user.email, email));
    console.log(`Usuario creado: ${email} (rol: ${role})`);
  }

  const [u] = await db.select().from(user).where(eq(user.email, email)).limit(1);

  if (role === "instructor" || role === "admin") {
    await db
      .insert(instructorProfiles)
      .values({ userId: u.id, displayName: name, commissionRate: "30.00", status: "approved" })
      .onConflictDoUpdate({
        target: instructorProfiles.userId,
        set: { displayName: name, status: "approved" },
      });
    console.log(`Perfil de instructor aprobado para ${email}.`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
