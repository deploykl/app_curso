import { buscarOrdenParaReembolso } from "@/modules/refunds/queries";
import { RevokeAccessButton } from "@/modules/refunds/ui/revoke-access-button";
import { Badge } from "@/components/ui/badge";
import { formatLima } from "@/lib/datetime";
import { formatPEN } from "@/lib/money";

export default async function AdminReembolsosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const orden = q ? await buscarOrdenParaReembolso(q) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Reembolsos</h1>

      <form className="flex items-center gap-3" action="/admin/reembolsos">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Número de orden o email del alumno"
          className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground">
          Buscar
        </button>
      </form>

      {q && !orden && (
        <p className="text-muted-foreground">No encontramos ninguna orden con ese número o email.</p>
      )}

      {orden && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {orden.orderNumber} · {orden.buyerName} · {orden.courseTitle}
            </span>
            {orden.status === "refunded" && <Badge variant="secondary">Reembolsada</Badge>}
            {orden.status === "paid" && <Badge>Pagada</Badge>}
            {orden.status !== "paid" && orden.status !== "refunded" && (
              <Badge variant="outline">{orden.status}</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {formatPEN(orden.totalCents)}
            {orden.paidAt && ` · Pagada el ${formatLima(orden.paidAt)}`}
          </div>
          {orden.status === "paid" && <RevokeAccessButton orderId={orden.orderId} />}
          {orden.status !== "paid" && orden.status !== "refunded" && (
            <p className="text-sm text-muted-foreground">
              Esta orden no está pagada, no se puede reembolsar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
