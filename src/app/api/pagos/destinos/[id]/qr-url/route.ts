import { eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentDestinations } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { presignGet } from "@/lib/r2";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const [row] = await db
    .select({ qrImageKey: paymentDestinations.qrImageKey })
    .from(paymentDestinations)
    .where(eq(paymentDestinations.id, id))
    .limit(1);

  if (!row?.qrImageKey) {
    return Response.json({ error: "Este destino no tiene un QR registrado." }, { status: 404 });
  }

  const url = await presignGet(row.qrImageKey);
  return Response.json({ url });
}
