import Link from "next/link";
import {
  getGlobalEarningsSummary,
  listAllEarnings,
  listEarningsByInstructor,
  listPayouts,
} from "@/modules/earnings/queries";
import { PayoutButton } from "@/modules/earnings/ui/payout-button";
import { ViewProofButton } from "@/modules/earnings/ui/view-proof-button";
import { ViewPayoutQrButton } from "@/modules/profiles/ui/view-payout-qr-button";
import { formatPEN } from "@/lib/money";
import { formatLima } from "@/lib/datetime";

const PAYOUT_METHOD_LABEL: Record<string, string> = {
  yape: "Yape", plin: "Plin", transferencia: "Transferencia", interbancario: "Interbancario",
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

export default async function AdminGananciasPage() {
  const [resumen, porInstructor, movimientos, pagos] = await Promise.all([
    getGlobalEarningsSummary(),
    listEarningsByInstructor(),
    listAllEarnings(),
    listPayouts(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ganancias y pagos a instructores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo que le corresponde a cada instructor después de la comisión de la plataforma.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pendiente
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{formatPEN(resumen.pendienteCents)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Disponible para pagar
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-success">
            {formatPEN(resumen.disponibleCents)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ya pagado
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

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Por instructor</h2>
        {porInstructor.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ventas aprobadas.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Instructor</th>
                  <th className="px-4 py-2 font-medium">Depositarle a</th>
                  <th className="px-4 py-2 text-right font-medium">Comisión</th>
                  <th className="px-4 py-2 text-right font-medium">Pendiente</th>
                  <th className="px-4 py-2 text-right font-medium">Disponible</th>
                  <th className="px-4 py-2 text-right font-medium">Pagado</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {porInstructor.map((i) => (
                  <tr key={i.instructorId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{i.instructorName}</td>
                    <td className="px-4 py-2">
                      {i.payoutMethod ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">
                            {PAYOUT_METHOD_LABEL[i.payoutMethod]} · {i.payoutHolderName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {i.payoutIdentifier}
                            {i.payoutBankName ? ` · ${i.payoutBankName}` : ""}
                          </span>
                          {i.hasPayoutQr && <ViewPayoutQrButton instructorId={i.instructorId} />}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin configurar</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {i.commissionRate}%
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPEN(i.pendienteCents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-success">
                      {formatPEN(i.disponibleCents)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {formatPEN(i.pagadoCents)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">
                      {formatPEN(i.totalCents)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <PayoutButton instructorId={i.instructorId} disponibleCents={i.disponibleCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          El % de comisión se edita por instructor en{" "}
          <Link href="/admin/usuarios" className="text-primary hover:underline">
            Usuarios
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Pagos realizados</h2>
        {pagos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se ha registrado ningún pago.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Instructor</th>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Referencia</th>
                  <th className="px-4 py-2 text-right font-medium">Monto</th>
                  <th className="px-4 py-2 font-medium">Evidencia</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{p.instructorName}</td>
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
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Historial de movimientos</h2>
        {movimientos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Curso</th>
                  <th className="px-4 py-2 font-medium">Instructor</th>
                  <th className="px-4 py-2 font-medium">Orden</th>
                  <th className="px-4 py-2 font-medium">Fecha de pago</th>
                  <th className="px-4 py-2 text-right font-medium">Bruto</th>
                  <th className="px-4 py-2 text-right font-medium">Comisión</th>
                  <th className="px-4 py-2 text-right font-medium">Neto</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((g) => (
                  <tr key={g.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{g.courseTitle}</td>
                    <td className="px-4 py-2 text-muted-foreground">{g.instructorName}</td>
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
    </div>
  );
}
