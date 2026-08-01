import { sql as sqlOp } from "drizzle-orm";
import { db } from "@/db";

// NOTA: este archivo NO tiene "use server" a propósito. expireStaleOrders es
// lógica de servidor invocada exclusivamente desde una ruta de API protegida
// por CRON_SECRET (ver src/app/api/cron/expirar-ordenes/route.ts), no una
// Server Action de UI. Si viviera en un módulo "use server", Next.js la
// registraría como endpoint público invocable sin auth por cualquiera.
export async function expireStaleOrders(now: Date = new Date()): Promise<number> {
  const result = await db.execute<{ id: string }>(sqlOp`
    update orders set status = 'expired'
    where status = 'pending'
      and expires_at < ${now.toISOString()}
      and id not in (select order_id from payment_proofs where status = 'pending')
    returning id
  `);
  return result.length;
}
