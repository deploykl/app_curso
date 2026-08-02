"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCourse, updateCourse } from "@/modules/catalog/actions";

interface Category {
  id: string;
  name: string;
}

interface CourseFormValues {
  title: string;
  subtitle?: string | null;
  descriptionMd?: string | null;
  categoryId?: string | null;
  level: "basico" | "intermedio" | "avanzado";
  priceSoles: string;
  estimatedHours?: string | null;
}

export function CourseForm({
  categories,
  courseId,
  initialValues,
}: {
  categories: Category[];
  courseId?: string;
  initialValues?: CourseFormValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const initialHoras = initialValues?.estimatedHours
    ? Math.floor(Number(initialValues.estimatedHours))
    : undefined;
  const initialMinutos = initialValues?.estimatedHours
    ? Math.round((Number(initialValues.estimatedHours) % 1) * 60)
    : undefined;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);

    const horas = Number(form.get("estimatedHoursH") ?? "0") || 0;
    const minutos = Number(form.get("estimatedHoursM") ?? "0") || 0;
    const duracion = horas + minutos / 60;

    const raw = {
      title: String(form.get("title") ?? ""),
      subtitle: String(form.get("subtitle") ?? "") || undefined,
      descriptionMd: String(form.get("descriptionMd") ?? "") || undefined,
      categoryId: String(form.get("categoryId") ?? "") || undefined,
      level: String(form.get("level") ?? "basico"),
      priceSoles: String(form.get("priceSoles") ?? "0"),
      estimatedHours: duracion > 0 ? duracion : undefined,
    };

    startTransition(async () => {
      try {
        if (courseId) {
          await updateCourse(courseId, raw);
          toast.success("Curso actualizado.");
        } else {
          const created = await createCourse(raw);
          toast.success("Curso creado como borrador.");
          router.push(`/instructor/cursos/${created.id}`);
          return;
        }
        router.refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "No pudimos guardar el curso.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Título</Label>
        <Input id="title" name="title" required minLength={3} defaultValue={initialValues?.title} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="subtitle">Subtítulo</Label>
        <Input id="subtitle" name="subtitle" defaultValue={initialValues?.subtitle ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="descriptionMd">Descripción</Label>
        <Textarea id="descriptionMd" name="descriptionMd" rows={5} defaultValue={initialValues?.descriptionMd ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="level">Nivel</Label>
          <select
            id="level"
            name="level"
            required
            defaultValue={initialValues?.level ?? "basico"}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="basico">Básico</option>
            <option value="intermedio">Intermedio</option>
            <option value="avanzado">Avanzado</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="categoryId">Categoría</Label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={initialValues?.categoryId ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="priceSoles">Precio (S/)</Label>
          <Input
            id="priceSoles"
            name="priceSoles"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={initialValues?.priceSoles}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="estimatedHoursH">Horas estimadas</Label>
          <div className="flex items-center gap-1.5">
            <Input
              id="estimatedHoursH"
              name="estimatedHoursH"
              type="number"
              min={0}
              max={999}
              step={1}
              placeholder="HH"
              className="w-full"
              defaultValue={initialHoras}
            />
            <span className="text-sm text-muted-foreground">h</span>
            <Input
              id="estimatedHoursM"
              name="estimatedHoursM"
              type="number"
              min={0}
              max={59}
              step={1}
              placeholder="MM"
              className="w-full"
              defaultValue={initialMinutos}
            />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : courseId ? "Guardar cambios" : "Crear curso"}
      </Button>
    </form>
  );
}
