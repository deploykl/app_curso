"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { submitPaymentProof } from "@/modules/billing/actions";

export function PaymentProofForm({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const file = fileInputRef.current?.files?.[0];
    if (!file) return setError("Adjunta la captura o foto del comprobante.");
    if (!token) return setError("Completa la verificación de seguridad.");

    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const presignRes = await fetch("/api/r2/payment-proof-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId, fileName: file.name, mimeType: file.type, sizeBytes: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error ?? "No se pudo preparar la subida.");

      const putRes = await fetch(presign.url, {
        method: "PUT", headers: { "Content-Type": file.type }, body: file,
      });
      if (!putRes.ok) throw new Error("Falló la subida del comprobante.");

      await submitPaymentProof(orderId, {
        method: String(form.get("method")),
        payerFullName: String(form.get("payerFullName")),
        payerDni: String(form.get("payerDni")),
        operationNumber: String(form.get("operationNumber")),
        declaredAmountCents: Math.round(Number(form.get("declaredAmount")) * 100),
        transferredAtLocal: String(form.get("transferredAtLocal")),
        fileKey: presign.key,
        turnstileToken: token,
      });

      toast.success(`Comprobante enviado para la orden ${orderNumber}. Te avisaremos por correo.`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No pudimos registrar tu comprobante.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-border p-5">
      <h2 className="text-lg font-medium">Subir comprobante</h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor="method">Método</Label>
        <select id="method" name="method" required className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="yape">Yape</option>
          <option value="plin">Plin</option>
          <option value="transferencia">Transferencia</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="payerFullName">Nombre del titular</Label>
          <Input id="payerFullName" name="payerFullName" required minLength={3} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="payerDni">DNI</Label>
          <Input id="payerDni" name="payerDni" required minLength={6} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="operationNumber">Nº de operación</Label>
          <Input id="operationNumber" name="operationNumber" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="declaredAmount">Monto pagado (S/)</Label>
          <Input id="declaredAmount" name="declaredAmount" type="number" min={0} step="0.01" required />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transferredAtLocal">Fecha y hora del pago</Label>
        <Input id="transferredAtLocal" name="transferredAtLocal" type="datetime-local" required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="proof-file">Captura o foto del comprobante</Label>
        <input ref={fileInputRef} id="proof-file" type="file" accept="image/png,image/jpeg,application/pdf" className="text-sm" />
      </div>

      <TurnstileWidget onToken={setToken} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Enviando..." : "Enviar comprobante"}
      </Button>
    </form>
  );
}
