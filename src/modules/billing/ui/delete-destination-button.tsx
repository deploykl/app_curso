"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { eliminarDestinoPagoAction } from "@/modules/billing/actions";

export function DeleteDestinationButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      try {
        await eliminarDestinoPagoAction(id);
        toast.success("Destino eliminado.");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar el destino.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        aria-label="Eliminar"
        title="Eliminar"
        variant="ghost"
        size="icon"
        className="size-8 border border-border text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar destino de pago</DialogTitle>
          <DialogDescription>
            ¿Eliminar <strong>{label}</strong>? Los alumnos ya no lo verán en la pantalla de pago.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>
            Cancelar
          </DialogClose>
          <Button type="button" variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
