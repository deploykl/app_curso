import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Building2, Clock, Receipt, Smartphone, XCircle } from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import { getOrderByNumber, getActivePaymentDestinations } from "@/modules/billing/queries";
import { formatPEN } from "@/lib/money";
import { formatLima } from "@/lib/datetime";
import { env } from "@/env";
import { PaymentProofForm } from "@/modules/billing/ui/payment-proof-form";
import { ViewDestinationQrButton } from "@/modules/billing/ui/view-destination-qr-button";

const METHOD_LABEL: Record<string, string> = {
  yape: "Yape", plin: "Plin", transferencia: "Transferencia bancaria",
};

const METHOD_ICON: Record<string, typeof Smartphone> = {
  yape: Smartphone, plin: Smartphone, transferencia: Building2,
};

export default async function PagoPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const u = await requireUser();
  const order = await getOrderByNumber(orderNumber);

  if (!order) notFound();
  if (order.userId !== u.id) notFound();
  if (order.status === "paid") redirect("/mi-aprendizaje");

  const destinations = await getActivePaymentDestinations();
  const highlightTransfer = order.totalCents > env.YAPE_MAX_CENTS;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <Receipt className="size-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Orden {order.orderNumber}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{order.courseTitle}</h1>
            {order.status === "pending" && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                Vence el {formatLima(order.expiresAt)}
              </p>
            )}
          </div>
        </div>
        <p className="text-3xl font-semibold tracking-tight">{formatPEN(order.totalCents)}</p>
      </div>

      {order.status === "pending" ? (
        <>
          {highlightTransfer && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <p>Este monto supera el límite diario habitual de Yape/Plin. Te recomendamos pagar por transferencia.</p>
            </div>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-5 place-items-center rounded-full bg-primary text-[0.7rem] text-primary-foreground">
                1
              </span>
              Elige un método y paga
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {destinations.map((d) => {
                const Icon = METHOD_ICON[d.method] ?? Smartphone;
                const atenuado = highlightTransfer && d.method !== "transferencia";
                return (
                  <div
                    key={d.id}
                    className={`flex flex-col gap-2 rounded-xl border bg-card p-4 transition-opacity ${
                      atenuado ? "border-border opacity-50" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                        <Icon className="size-4" />
                      </div>
                      <p className="font-medium">{METHOD_LABEL[d.method]}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{d.holderName}</p>
                    <p className="font-mono text-sm">{d.identifier}</p>
                    {d.bankName && <p className="text-sm text-muted-foreground">{d.bankName}</p>}
                    {d.qrImageKey && <ViewDestinationQrButton destinationId={d.id} />}
                    {d.instructionsMd && (
                      <p className="mt-1 border-t border-border pt-2 text-xs text-muted-foreground">
                        {d.instructionsMd}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-5 place-items-center rounded-full bg-primary text-[0.7rem] text-primary-foreground">
                2
              </span>
              Sube tu comprobante
            </h2>
            <PaymentProofForm
              orderId={order.id}
              orderNumber={order.orderNumber}
              totalCents={order.totalCents}
            />
          </section>
        </>
      ) : order.status === "expired" ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <p>Esta orden venció. Vuelve al curso para generar una nueva.</p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <p>Esta orden ya no admite pago.</p>
        </div>
      )}
    </div>
  );
}
