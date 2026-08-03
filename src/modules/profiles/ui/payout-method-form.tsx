"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { guardarMetodoPagoAction } from "@/modules/profiles/actions";
import type { PayoutMethodInfo } from "@/modules/profiles/queries";

type PayoutMethod = "yape" | "plin" | "transferencia" | "interbancario";

const METHOD_LABEL: Record<PayoutMethod, string> = {
  yape: "Yape", plin: "Plin", transferencia: "Transferencia bancaria", interbancario: "Transferencia interbancaria (CCI)",
};

const IDENTIFIER_LABEL: Record<PayoutMethod, string> = {
  yape: "Número de celular", plin: "Número de celular",
  transferencia: "Número de cuenta", interbancario: "Número de cuenta interbancario (CCI)",
};

function acceptsQr(method: PayoutMethod) {
  return method === "yape" || method === "plin";
}

function acceptsBank(method: PayoutMethod) {
  return method === "transferencia" || method === "interbancario";
}

const BANKS = ["BCP", "BBVA", "Interbank", "Scotiabank"];

export function PayoutMethodForm({ info, triggerLabel }: { info: PayoutMethodInfo | null; triggerLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PayoutMethod>(info?.payoutMethod ?? "yape");
  const [qrKey, setQrKey] = useState(info?.payoutQrImageKey ?? "");
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function subirQr(file: File) {
    setUploading(true);
    try {
      const presignRes = await fetch("/api/r2/payout-qr-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error ?? "No se pudo preparar la subida.");

      const putRes = await fetch(presign.url, {
        method: "PUT", headers: { "Content-Type": file.type }, body: file,
      });
      if (!putRes.ok) throw new Error("Falló la subida del QR.");

      setQrKey(presign.key);
      toast.success("QR cargado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos subir el QR.");
    } finally {
      setUploading(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    const raw = {
      payoutMethod: method,
      payoutHolderName: String(form.get("payoutHolderName") ?? ""),
      payoutIdentifier: String(form.get("payoutIdentifier") ?? ""),
      payoutBankName: acceptsBank(method) ? String(form.get("payoutBankName") ?? "") : undefined,
      payoutQrImageKey: acceptsQr(method) ? qrKey || undefined : undefined,
    };

    startTransition(async () => {
      try {
        await guardarMetodoPagoAction(raw);
        toast.success("Método de cobro guardado.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No pudimos guardar tu método de cobro.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted">
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Método de cobro</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Así sabrá el admin a dónde depositarte tus ganancias.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="payoutMethod">Método</Label>
            <select
              id="payoutMethod"
              value={method}
              onChange={(e) => setMethod(e.target.value as PayoutMethod)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {(Object.keys(METHOD_LABEL) as PayoutMethod[]).map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="payoutHolderName">Titular</Label>
            <Input
              id="payoutHolderName"
              name="payoutHolderName"
              required
              minLength={3}
              defaultValue={info?.payoutHolderName ?? ""}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="payoutIdentifier">{IDENTIFIER_LABEL[method]}</Label>
            <Input
              id="payoutIdentifier"
              name="payoutIdentifier"
              required
              minLength={3}
              defaultValue={info?.payoutIdentifier ?? ""}
            />
          </div>

          {acceptsBank(method) && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="payoutBankName">Banco</Label>
              <select
                id="payoutBankName"
                name="payoutBankName"
                required
                defaultValue={info?.payoutBankName ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="" disabled>Selecciona un banco</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                {info?.payoutBankName && !BANKS.includes(info.payoutBankName) && (
                  <option value={info.payoutBankName}>{info.payoutBankName}</option>
                )}
              </select>
            </div>
          )}

          {acceptsQr(method) && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="qr-file">Código QR (opcional)</Label>
              <FileInput
                id="qr-file"
                accept="image/png,image/jpeg"
                hint="PNG o JPG"
                onFileChange={(file) => { if (file) void subirQr(file); }}
              />
              {qrKey && <p className="text-xs text-success">QR listo para guardar.</p>}
              {uploading && <p className="text-xs text-muted-foreground">Subiendo...</p>}
            </div>
          )}

          <Button type="submit" disabled={isPending || uploading}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
