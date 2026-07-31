"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aprobarPago, rechazarPago } from "@/modules/billing/actions";
import type { PendingProofRow } from "@/modules/billing/queries";
import { formatPEN } from "@/lib/money";
import { formatLima } from "@/lib/datetime";

export function AdminProofReview({ proof }: { proof: PendingProofRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  async function verComprobante() {
    const res = await fetch(`/api/admin/pagos/${proof.proofId}/comprobante-url`);
    const data = await res.json();
    if (res.ok) setProofUrl(data.url);
    else toast.error(data.error ?? "No se pudo abrir el comprobante.");
  }

  function aprobar() {
    startTransition(async () => {
      try {
        await aprobarPago(proof.orderId);
        toast.success(`Orden ${proof.orderNumber} aprobada.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo aprobar.");
      }
    });
  }

  function rechazar() {
    if (!reason.trim()) return toast.error("Escribe el motivo del rechazo.");
    startTransition(async () => {
      try {
        await rechazarPago(proof.orderId, reason);
        toast.success(`Orden ${proof.orderNumber} rechazada.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo rechazar.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-5">
      <div className="flex items-center justify-between">
        <span className="font-medium">{proof.orderNumber} · {proof.courseTitle}</span>
        <span className="font-semibold">{formatPEN(proof.totalCents)}</span>
      </div>
      <p className="rounded-md bg-warning/10 p-2 text-xs text-warning-foreground">
        Verifica en tu app de Yape/banco, no en la imagen.
      </p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-muted-foreground">Comprador</dt><dd>{proof.buyerName}</dd></div>
        <div><dt className="text-muted-foreground">Método</dt><dd>{proof.method}</dd></div>
        <div><dt className="text-muted-foreground">Titular declarado</dt><dd>{proof.payerFullName}</dd></div>
        <div><dt className="text-muted-foreground">DNI</dt><dd>{proof.payerDni}</dd></div>
        <div><dt className="text-muted-foreground">Nº de operación</dt><dd>{proof.operationNumber}</dd></div>
        <div><dt className="text-muted-foreground">Monto declarado</dt><dd>{formatPEN(proof.declaredAmountCents)}</dd></div>
        <div><dt className="text-muted-foreground">Fecha declarada</dt><dd>{formatLima(new Date(proof.transferredAt))}</dd></div>
      </dl>

      {proofUrl ? (
        <a href={proofUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
          Abrir comprobante en una pestaña nueva
        </a>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={verComprobante}>
          Ver comprobante
        </Button>
      )}

      <div className="flex items-center gap-2">
        <Input placeholder="Motivo si rechazas" value={reason} onChange={(e) => setReason(e.target.value)} className="h-8" />
        <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={rechazar}>
          Rechazar
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={aprobar}>
          Aprobar
        </Button>
      </div>
    </div>
  );
}
