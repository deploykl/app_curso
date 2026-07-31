import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { getOrderByNumber, getActivePaymentDestinations } from "@/modules/billing/queries";
import { formatPEN } from "@/lib/money";
import { env } from "@/env";
import { PaymentProofForm } from "@/modules/billing/ui/payment-proof-form";

const METHOD_LABEL: Record<string, string> = {
  yape: "Yape", plin: "Plin", transferencia: "Transferencia bancaria",
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
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-muted-foreground">Orden {order.orderNumber}</p>
        <h1 className="text-2xl font-semibold">{order.courseTitle}</h1>
        <p className="mt-1 text-3xl font-semibold">{formatPEN(order.totalCents)}</p>
      </div>

      {order.status === "expired" ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          Esta orden venció. Vuelve al curso para generar una nueva.
        </p>
      ) : (
        <>
          {highlightTransfer && (
            <p className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm">
              Este monto supera el límite diario habitual de Yape/Plin. Te recomendamos pagar por transferencia.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {destinations.map((d) => (
              <div
                key={d.id}
                className={`rounded-lg border p-4 ${
                  highlightTransfer && d.method !== "transferencia" ? "opacity-50" : "border-border"
                }`}
              >
                <p className="font-medium">{METHOD_LABEL[d.method]}</p>
                <p className="mt-1 text-sm text-muted-foreground">{d.holderName}</p>
                <p className="mt-1 font-mono text-sm">{d.identifier}</p>
                {d.bankName && <p className="text-sm text-muted-foreground">{d.bankName}</p>}
                {d.instructionsMd && <p className="mt-2 text-xs text-muted-foreground">{d.instructionsMd}</p>}
              </div>
            ))}
          </div>

          <PaymentProofForm orderId={order.id} orderNumber={order.orderNumber} />
        </>
      )}
    </div>
  );
}
