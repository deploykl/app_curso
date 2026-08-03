import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instructorProfiles } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { presignGet } from "@/lib/r2";

export async function GET(_req: Request, { params }: { params: Promise<{ instructorId: string }> }) {
  const u = await requireUser();
  const { instructorId } = await params;

  if (u.role !== "admin" && u.id !== instructorId) {
    return Response.json({ error: "Sin permiso." }, { status: 403 });
  }

  const [row] = await db
    .select({ payoutQrImageKey: instructorProfiles.payoutQrImageKey })
    .from(instructorProfiles)
    .where(eq(instructorProfiles.userId, instructorId))
    .limit(1);

  if (!row?.payoutQrImageKey) {
    return Response.json({ error: "Este instructor no tiene un QR registrado." }, { status: 404 });
  }

  const url = await presignGet(row.payoutQrImageKey);
  return Response.json({ url });
}
