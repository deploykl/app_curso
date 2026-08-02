"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/modules/auth/session";
import {
  crearUsuario,
  actualizarRolUsuario,
  establecerActivoUsuario,
  establecerComisionInstructor,
  UsuarioYaExisteError,
  type RolUsuario,
} from "./service";

const crearUsuarioSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(["student", "instructor", "admin"]),
});

export async function crearUsuarioAction(input: {
  name: string;
  email: string;
  password: string;
  role: RolUsuario;
}): Promise<void> {
  await assertRole(["admin"]);

  const parsed = crearUsuarioSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Datos inválidos.");

  try {
    await crearUsuario(parsed.data);
  } catch (e) {
    if (e instanceof UsuarioYaExisteError) throw e;
    throw new Error("No se pudo crear el usuario. Intenta de nuevo.");
  }

  revalidatePath("/admin/usuarios");
}

export async function actualizarRolUsuarioAction(targetUserId: string, role: RolUsuario): Promise<void> {
  const admin = await assertRole(["admin"]);
  if (admin.id === targetUserId) throw new Error("No puedes cambiar tu propio rol.");

  const parsedRole = z.enum(["student", "instructor", "admin"]).safeParse(role);
  if (!parsedRole.success) throw new Error("Rol inválido.");

  await actualizarRolUsuario(targetUserId, parsedRole.data);
  revalidatePath("/admin/usuarios");
}

export async function establecerActivoUsuarioAction(targetUserId: string, active: boolean): Promise<void> {
  const admin = await assertRole(["admin"]);
  if (admin.id === targetUserId) throw new Error("No puedes desactivar tu propia cuenta.");

  await establecerActivoUsuario(targetUserId, active);
  revalidatePath("/admin/usuarios");
}

export async function establecerComisionInstructorAction(targetUserId: string, rate: number): Promise<void> {
  await assertRole(["admin"]);

  const parsed = z.coerce.number().min(0).max(100).multipleOf(0.01).safeParse(rate);
  if (!parsed.success) throw new Error("La comisión debe ser un porcentaje entre 0 y 100.");

  await establecerComisionInstructor(targetUserId, parsed.data);
  revalidatePath("/admin/usuarios");
}
