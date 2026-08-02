import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";

export async function buscarUsuarioPorEmail(email: string) {
  const [row] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  return row ?? null;
}

export async function listarUsuarios() {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt));
}
