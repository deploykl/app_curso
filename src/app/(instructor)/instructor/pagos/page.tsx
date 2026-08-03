import { CreditCard } from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import {
  getInstructorEarningsSummary,
  listInstructorEarnings,
  listPayouts,
} from "@/modules/earnings/queries";
import { ViewProofButton } from "@/modules/earnings/ui/view-proof-button";
import { getPlatformSettings } from "@/modules/settings/queries";
import { getPayoutMethod } from "@/modules/profiles/queries";
import { PayoutMethodForm } from "@/modules/profiles/ui/payout-method-form";
import { ViewPayoutQrButton } from "@/modules/profiles/ui/view-payout-qr-button";
import { formatPEN } from "@/lib/money";
import { formatLima } from "@/lib/datetime";

const PAYOUT_METHOD_LABEL: Record<string, string> = {
  yape: "Yape", plin: "Plin", transferencia: "Transferencia bancaria", interbancario: "Transferencia interbancaria (CCI)",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  available: "Disponible",
  paid: "Pagado",
  reversed: "Reembolsado",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-warning/15 text-warning-foreground",
  available: "bg-success/15 text-success",
  paid: "bg-muted text-muted-foreground",
  reversed: "bg-destructive/15 text-destructive",
};

export default async function InstructorPagosPage() {
  const u = await requireUser();
  const [resumen, ganancias, pagos, { earningAvailableDays }, metodoPago] = await Promise.all([
    getInstructorEarningsSummary(u.id),
    listInstructorEarnings(u.id),
    listPayouts(u.id),
    getPlatformSettings(),
    getPayoutMethod(u.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis pagos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo que ganas por cada venta, después de la comisión de la plataforma.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <CreditCard className="size-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Método de cobro
            </p>
            {metodoPago?.payoutMethod ? (
              <>
                <p className="font-medium">
                  {PAYOUT_METHOD_LABEL[metodoPago.payoutMethod]} · {metodoPago.payoutHolderName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {metodoPago.payoutIdentifier}
                  {metodoPago.payoutBankName ? ` · ${metodoPago.payoutBankName}` : ""}
                </p>
                {metodoPago.payoutQrImageKey && <ViewPayoutQrButton instructorId={u.id} />}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Todavía no lo configuras. El admin no sabrá a dónde depositarte.
              </p>
            )}
          </div>
        </div>
        <PayoutMethodForm info={metodoPago} triggerLabel={metodoPago?.payoutMethod ? "Editar" : "Configurar"} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pendiente
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{formatPEN(resumen.pendienteCents)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Todavía en el periodo de garantía de {earningAvailableDays} día{earningAvailableDays === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Disponible
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-success">
            {formatPEN(resumen.disponibleCents)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Ya se puede liquidar</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pagado
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{formatPEN(resumen.pagadoCents)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Total acumulado
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{formatPEN(resumen.totalCents)}</p>
        </div>
      </div>

      {pagos.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Pagos recibidos</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Referencia</th>
                  <th className="px-4 py-2 text-right font-medium">Monto</th>
                  <th className="px-4 py-2 font-medium">Evidencia</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.paidAt ? formatLima(p.paidAt) : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{p.reference ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">
                      {formatPEN(p.totalCents)}
                    </td>
                    <td className="px-4 py-2">
                      <ViewProofButton payoutId={p.id} hasProof={p.hasProof} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ganancias.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          Todavía no tienes ventas aprobadas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Curso</th>
                <th className="px-4 py-2 font-medium">Orden</th>
                <th className="px-4 py-2 font-medium">Fecha de pago</th>
                <th className="px-4 py-2 text-right font-medium">Bruto</th>
                <th className="px-4 py-2 text-right font-medium">Comisión</th>
                <th className="px-4 py-2 text-right font-medium">Neto</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ganancias.map((g) => (
                <tr key={g.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{g.courseTitle}</td>
                  <td className="px-4 py-2 text-muted-foreground">{g.orderNumber}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {g.paidAt ? formatLima(g.paidAt) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPEN(g.grossCents)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    -{formatPEN(g.commissionCents)} ({g.commissionRatePct}%)
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {formatPEN(g.netCents)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[g.status]}`}
                    >
                      {STATUS_LABEL[g.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
