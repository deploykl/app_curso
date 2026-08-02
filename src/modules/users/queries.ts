import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { user, instructorProfiles } from "@/db/schema";

export async function buscarUsuarioPorEmail(email: string) {
  const [row] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  return row ?? null;
}

export async function listarUsuarios() {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
      commissionRate: instructorProfiles.commissionRate,
    })
    .from(user)
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, user.id))
    .orderBy(desc(user.createdAt));

  return rows.map((r) => ({
    ...r,
    commissionRate: r.commissionRate === null ? null : Number(r.commissionRate),
  }));
}
