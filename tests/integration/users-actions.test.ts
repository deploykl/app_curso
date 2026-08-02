import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, account, instructorProfiles,
  certificates, examAttemptAnswers, examAttemptQuestions, examAttempts,
  questionOptions, questions, exams, sessionAttendance,
  instructorEarnings, paymentProofs, orderItems, orders, enrollments, classSessions, courses,
} from "@/db/schema";

async function limpiarTablasCompartidas() {
  await db.delete(certificates);
  await db.delete(examAttemptAnswers);
  await db.delete(examAttemptQuestions);
  await db.delete(examAttempts);
  await db.delete(questionOptions);
  await db.delete(questions);
  await db.delete(exams);
  await db.delete(sessionAttendance);
  await db.delete(instructorEarnings);
  await db.delete(paymentProofs);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(instructorProfiles);
  await db.delete(account);
  await db.delete(user);
}

let currentUser: { id: string; role: string; name: string } = { id: "", role: "admin", name: "Admin" };

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async (roles: string[]) => {
    if (!roles.includes(currentUser.role)) throw new Error("No autorizado");
    return currentUser;
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { crearUsuarioAction, actualizarRolUsuarioAction, establecerActivoUsuarioAction } = await import("@/modules/users/actions");

beforeEach(async () => {
  await limpiarTablasCompartidas();

  const [admin] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Admin", email: "admin@test.pe", emailVerified: true, role: "admin",
  }).returning();
  currentUser = { id: admin.id, role: "admin", name: "Admin" };
});

afterAll(async () => {
  await limpiarTablasCompartidas();
});

describe("crearUsuarioAction", () => {
  it("crea un instructor con perfil aprobado", async () => {
    await crearUsuarioAction({ name: "Prof Nueva", email: "prof-nuevo@test.pe", password: "clave1234", role: "instructor" });

    const [u] = await db.select().from(user).where(eq(user.email, "prof-nuevo@test.pe"));
    expect(u.role).toBe("instructor");

    const [p] = await db.select().from(instructorProfiles).where(eq(instructorProfiles.userId, u.id));
    expect(p.status).toBe("approved");
  });

  it("crea un admin con perfil aprobado", async () => {
    await crearUsuarioAction({ name: "Admin Nuevo", email: "admin2@test.pe", password: "clave1234", role: "admin" });

    const [u] = await db.select().from(user).where(eq(user.email, "admin2@test.pe"));
    expect(u.role).toBe("admin");

    const [p] = await db.select().from(instructorProfiles).where(eq(instructorProfiles.userId, u.id));
    expect(p.status).toBe("approved");
  });

  it("crea un alumno sin perfil de instructor", async () => {
    await crearUsuarioAction({ name: "Alumno", email: "alu-nuevo@test.pe", password: "clave1234", role: "student" });

    const [u] = await db.select().from(user).where(eq(user.email, "alu-nuevo@test.pe"));
    expect(u.role).toBe("student");

    const perfiles = await db.select().from(instructorProfiles).where(eq(instructorProfiles.userId, u.id));
    expect(perfiles).toHaveLength(0);
  });

  it("rechaza si el email ya existe", async () => {
    await crearUsuarioAction({ name: "Uno", email: "dup@test.pe", password: "clave1234", role: "student" });

    await expect(
      crearUsuarioAction({ name: "Dos", email: "dup@test.pe", password: "clave1234", role: "student" })
    ).rejects.toThrow(/ya existe/i);
  });

  it("rechaza si la contraseña es muy corta", async () => {
    await expect(
      crearUsuarioAction({ name: "X", email: "corta@test.pe", password: "1234567", role: "student" })
    ).rejects.toThrow();

    const rows = await db.select().from(user).where(eq(user.email, "corta@test.pe"));
    expect(rows).toHaveLength(0);
  });

  it("rechaza si lo invoca alguien no-admin", async () => {
    currentUser = { id: crypto.randomUUID(), role: "instructor", name: "Prof" };

    await expect(
      crearUsuarioAction({ name: "X", email: "nope@test.pe", password: "clave1234", role: "student" })
    ).rejects.toThrow();
  });
});

describe("actualizarRolUsuarioAction", () => {
  it("promueve un alumno a instructor y le crea perfil aprobado", async () => {
    await crearUsuarioAction({ name: "Alumno", email: "promover@test.pe", password: "clave1234", role: "student" });
    const [u] = await db.select().from(user).where(eq(user.email, "promover@test.pe"));

    await actualizarRolUsuarioAction(u.id, "instructor");

    const [actualizado] = await db.select().from(user).where(eq(user.id, u.id));
    expect(actualizado.role).toBe("instructor");
    const [p] = await db.select().from(instructorProfiles).where(eq(instructorProfiles.userId, u.id));
    expect(p.status).toBe("approved");
  });

  it("rechaza que el admin se cambie su propio rol", async () => {
    await expect(actualizarRolUsuarioAction(currentUser.id, "student")).rejects.toThrow(/propio rol/i);
  });

  it("rechaza si lo invoca alguien no-admin", async () => {
    await crearUsuarioAction({ name: "Alumno", email: "target@test.pe", password: "clave1234", role: "student" });
    const [u] = await db.select().from(user).where(eq(user.email, "target@test.pe"));

    currentUser = { id: crypto.randomUUID(), role: "instructor", name: "Prof" };
    await expect(actualizarRolUsuarioAction(u.id, "admin")).rejects.toThrow();
  });
});

describe("establecerActivoUsuarioAction", () => {
  it("desactiva y reactiva una cuenta sin borrar datos", async () => {
    await crearUsuarioAction({ name: "Alumno", email: "toggle@test.pe", password: "clave1234", role: "student" });
    const [u] = await db.select().from(user).where(eq(user.email, "toggle@test.pe"));

    await establecerActivoUsuarioAction(u.id, false);
    const [desactivado] = await db.select().from(user).where(eq(user.id, u.id));
    expect(desactivado.active).toBe(false);

    await establecerActivoUsuarioAction(u.id, true);
    const [reactivado] = await db.select().from(user).where(eq(user.id, u.id));
    expect(reactivado.active).toBe(true);
  });

  it("rechaza que el admin se desactive a sí mismo", async () => {
    await expect(establecerActivoUsuarioAction(currentUser.id, false)).rejects.toThrow(/propia cuenta/i);
  });

  it("rechaza si lo invoca alguien no-admin", async () => {
    await crearUsuarioAction({ name: "Alumno", email: "target2@test.pe", password: "clave1234", role: "student" });
    const [u] = await db.select().from(user).where(eq(user.email, "target2@test.pe"));

    currentUser = { id: crypto.randomUUID(), role: "instructor", name: "Prof" };
    await expect(establecerActivoUsuarioAction(u.id, false)).rejects.toThrow();
  });
});
