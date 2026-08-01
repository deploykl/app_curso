"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { publicarExamen, despublicarExamen } from "@/modules/assessment/actions";

export function PublishExamButton({
  courseId,
  isPublished,
}: {
  courseId: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        if (isPublished) {
          await despublicarExamen(courseId);
          toast.success("Examen despublicado.");
        } else {
          await publicarExamen(courseId);
          toast.success("Examen publicado.");
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No pudimos cambiar el estado del examen.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant={isPublished ? "outline" : "default"}
      disabled={isPending}
      onClick={onClick}
      className="self-start"
    >
      {isPending ? "Guardando..." : isPublished ? "Despublicar examen" : "Publicar examen"}
    </Button>
  );
}
