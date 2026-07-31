"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { publishCourse, unpublishCourse } from "@/modules/catalog/actions";

export function PublishButton({ courseId, status }: { courseId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        if (status === "published") {
          await unpublishCourse(courseId);
          toast.success("Curso despublicado.");
        } else {
          await publishCourse(courseId);
          toast.success("Curso publicado.");
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
      }
    });
  }

  return (
    <Button type="button" variant={status === "published" ? "outline" : "default"} disabled={isPending} onClick={onClick}>
      {isPending ? "Procesando..." : status === "published" ? "Despublicar" : "Publicar"}
    </Button>
  );
}
