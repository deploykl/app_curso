import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payouts } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { presignGet } from "@/lib/r2";

export async function GET(_req: Request, { params }: { params: Promise<{ payoutId: string }> }) {
  const u = await requireUser();
  const { payoutId } = await params;

  const [payout] = await db
    .select({ instructorId: payouts.instructorId, proofFileKey: payouts.proofFileKey })
    .from(payouts)
    .where(eq(payouts.id, payoutId))
    .limit(1);
  if (!payout) return Response.json({ error: "Pago no encontrado." }, { status: 404 });

  // Solo el admin o el instructor dueño del pago pueden ver su evidencia.
  if (u.role !== "admin" && u.id !== payout.instructorId) {
    return Response.json({ error: "Sin permiso." }, { status: 403 });
  }
  if (!payout.proofFileKey) {
    return Response.json({ error: "Este pago no tiene evidencia adjunta." }, { status: 404 });
  }

  const url = await presignGet(payout.proofFileKey);
  return Response.json({ url });
}
