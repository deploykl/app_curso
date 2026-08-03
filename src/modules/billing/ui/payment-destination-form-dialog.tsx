"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { guardarDestinoPagoAction } from "@/modules/billing/actions";

type Method = "yape" | "plin" | "transferencia";

const METHOD_LABEL: Record<Method, string> = {
  yape: "Yape", plin: "Plin", transferencia: "Transferencia bancaria",
};

const BANKS = ["BCP", "BBVA", "Interbank", "Scotiabank"];

export interface DestinoValues {
  id: string;
  method: Method;
  holderName: string;
  identifier: string;
  bankName: string | null;
  qrImageKey: string | null;
  instructionsMd: string | null;
  isActive: boolean;
  orderIndex: number;
}

export function PaymentDestinationFormDialog({ destino }: { destino?: DestinoValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>(destino?.method ?? "yape");
  const [qrKey, setQrKey] = useState(destino?.qrImageKey ?? "");
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const esEdicion = Boolean(destino);

  async function subirQr(file: File) {
    setUploading(true);
    try {
      const presignRes = await fetch("/api/r2/payment-destination-qr-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationId: destino?.id, fileName: file.name, mimeType: file.type, sizeBytes: file.size,
        }),
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
      method,
      holderName: String(form.get("holderName") ?? ""),
      identifier: String(form.get("identifier") ?? ""),
      bankName: method === "transferencia" ? String(form.get("bankName") ?? "") : undefined,
      qrImageKey: qrKey || undefined,
      instructionsMd: String(form.get("instructionsMd") ?? "").trim() || undefined,
      isActive: form.get("isActive") === "on",
      orderIndex: Number(form.get("orderIndex") ?? 0),
    };

    startTransition(async () => {
      try {
        await guardarDestinoPagoAction(destino?.id ?? null, raw);
        toast.success(esEdicion ? "Destino actualizado." : "Destino agregado.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No pudimos guardar el destino.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {esEdicion ? (
        <DialogTrigger className="inline-flex h-8 items-center justify-center rounded-md border border-input px-2.5 text-xs font-medium hover:bg-muted">
          Editar
        </DialogTrigger>
      ) : (
        <DialogTrigger className={buttonVariants({ className: "gap-1.5" })}>
          <Plus className="size-4" />
          Agregar destino
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{esEdicion ? "Editar destino de pago" : "Nuevo destino de pago"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="method">Método</Label>
            <select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value as Method)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="holderName">Titular</Label>
            <Input id="holderName" name="holderName" required minLength={2} defaultValue={destino?.holderName ?? ""} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="identifier">
              {method === "transferencia" ? "Número de cuenta (CCI)" : "Número de celular"}
            </Label>
            <Input id="identifier" name="identifier" required minLength={3} defaultValue={destino?.identifier ?? ""} />
          </div>

          {method === "transferencia" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="bankName">Banco</Label>
              <select
                id="bankName"
                name="bankName"
                required
                defaultValue={destino?.bankName ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="" disabled>Selecciona un banco</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                {destino?.bankName && !BANKS.includes(destino.bankName) && (
                  <option value={destino.bankName}>{destino.bankName}</option>
                )}
              </select>
            </div>
          )}

          {method !== "transferencia" && (
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="instructionsMd">Instrucciones para el alumno</Label>
            <Textarea
              id="instructionsMd"
              name="instructionsMd"
              rows={2}
              defaultValue={destino?.instructionsMd ?? ""}
            />
          </div>

          <div className="grid grid-cols-2 items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="orderIndex">Orden</Label>
              <Input
                id="orderIndex"
                name="orderIndex"
                type="number"
                min={0}
                max={999}
                defaultValue={destino?.orderIndex ?? 0}
              />
            </div>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={destino?.isActive ?? true}
                className="size-4 accent-primary"
              />
              Visible para el alumno
            </label>
          </div>

          <Button type="submit" disabled={isPending || uploading}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
