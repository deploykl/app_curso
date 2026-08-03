"use client";
import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";

function useCopiar(url: string) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No pudimos copiar el link. Cópialo manualmente.");
    }
  }

  return { copiado, copiar };
}

export function ShareCourseLink({ url }: { url: string }) {
  const { copiado, copiar } = useCopiar(url);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Link2 className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">Link para compartir con tus alumnos</p>
        <p className="truncate text-sm font-medium">{url}</p>
      </div>
      <button
        type="button"
        onClick={copiar}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        {copiado ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

export function CopyCourseLinkButton({ url }: { url: string }) {
  const { copiado, copiar } = useCopiar(url);

  return (
    <button
      type="button"
      onClick={copiar}
      aria-label="Copiar link para compartir"
      title="Copiar link para compartir"
      className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {copiado ? <Check className="size-3.5 text-success" /> : <Link2 className="size-3.5" />}
    </button>
  );
}
