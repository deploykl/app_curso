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
import { deleteCourse } from "@/modules/catalog/actions";

export function DeleteCourseButton({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      try {
        await deleteCourse(courseId);
        toast.success("Curso eliminado.");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar el curso.");
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
          <DialogTitle>Eliminar curso</DialogTitle>
          <DialogDescription>
            ¿Eliminar <strong>{courseTitle}</strong>? Esta acción no se puede deshacer. Solo se puede
            eliminar un curso sin alumnos inscritos ni órdenes de compra.
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
