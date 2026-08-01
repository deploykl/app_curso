import { env } from "@/env";
import { expireStaleOrders } from "@/modules/billing/jobs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const count = await expireStaleOrders();
  return Response.json({ expired: count });
}
