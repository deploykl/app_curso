import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { user, account, instructorProfiles } from "@/db/schema";
import { auth } from "@/lib/auth";
import { buscarUsuarioPorEmail } from "./queries";

export type RolUsuario = "student" | "instructor" | "admin";

export class UsuarioYaExisteError extends Error {
  constructor(email: string) {
    super(`Ya existe una cuenta con el correo ${email}.`);
  }
}

export interface CrearUsuarioInput {
  email: string;
  password: string;
  name: string;
  role: RolUsuario;
}

async function upsertPerfilInstructor(userId: string, name: string) {
  await db
    .insert(instructorProfiles)
    .values({ userId, displayName: name, commissionRate: "30.00", status: "approved" })
    .onConflictDoUpdate({
      target: instructorProfiles.userId,
      set: { displayName: name, status: "approved" },
    });
}

/** Crea una cuenta nueva. Rechaza si el email ya existe (UsuarioYaExisteError). */
export async function crearUsuario(input: CrearUsuarioInput): Promise<{ id: string }> {
  const existing = await buscarUsuarioPorEmail(input.email);
  if (existing) throw new UsuarioYaExisteError(input.email);

  await auth.api.signUpEmail({
    body: { email: input.email, password: input.password, name: input.name },
  });
  await db.update(user).set({ role: input.role, emailVerified: true }).where(eq(user.email, input.email));

  const nuevo = await buscarUsuarioPorEmail(input.email);
  if (!nuevo) throw new Error("No se pudo crear el usuario.");

  if (input.role === "instructor" || input.role === "admin") {
    await upsertPerfilInstructor(nuevo.id, input.name);
  }

  return { id: nuevo.id };
}

/** Solo para el CLI de bootstrap: promueve/actualiza una cuenta existente. La UI no lo expone. */
export async function actualizarUsuarioExistente(input: CrearUsuarioInput): Promise<void> {
  const existing = await buscarUsuarioPorEmail(input.email);
  if (!existing) throw new Error(`No existe usuario con email ${input.email}.`);

  await db.update(user).set({ name: input.name, role: input.role, emailVerified: true }).where(eq(user.id, existing.id));

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(input.password);
  await db.update(account).set({ password: hash })
    .where(and(eq(account.userId, existing.id), eq(account.providerId, "credential")));

  if (input.role === "instructor" || input.role === "admin") {
    await upsertPerfilInstructor(existing.id, input.name);
  }
}

/** Cambia el rol de una cuenta ya existente. Si pasa a instructor/admin, asegura perfil aprobado. */
export async function actualizarRolUsuario(userId: string, role: RolUsuario): Promise<void> {
  const [target] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!target) throw new Error("Usuario no encontrado.");

  await db.update(user).set({ role }).where(eq(user.id, userId));

  if (role === "instructor" || role === "admin") {
    await upsertPerfilInstructor(userId, target.name);
  }
}

/** Activa o desactiva el acceso de una cuenta (no borra ningún dato). */
export async function establecerActivoUsuario(userId: string, active: boolean): Promise<void> {
  const [target] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!target) throw new Error("Usuario no encontrado.");

  await db.update(user).set({ active }).where(eq(user.id, userId));
}

/**
 * Cambia el % que se queda la casa sobre las ventas de un instructor. Solo
 * afecta a órdenes futuras: las ganancias ya calculadas (`instructor_earnings`)
 * guardan su propio `commissionRate` como snapshot y no se recalculan.
 */
export async function establecerComisionInstructor(userId: string, rate: number): Promise<void> {
  const [target] = await db.select().from(instructorProfiles)
    .where(eq(instructorProfiles.userId, userId)).limit(1);
  if (!target) throw new Error("Este usuario no tiene perfil de instructor.");

  await db.update(instructorProfiles)
    .set({ commissionRate: rate.toFixed(2), updatedAt: new Date() })
    .where(eq(instructorProfiles.userId, userId));
}
