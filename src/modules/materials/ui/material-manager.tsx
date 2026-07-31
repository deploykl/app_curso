"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addFileMaterial, addLinkMaterial, deleteMaterial } from "@/modules/materials/actions";

export interface MaterialRow {
  id: string;
  title: string;
  fileKey: string | null;
  externalUrl: string | null;
}

export function MaterialManager({ sessionId, materials }: { sessionId: string; materials: MaterialRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"archivo" | "enlace">("archivo");
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "");
    if (!file) {
      toast.error("Selecciona un archivo.");
      return;
    }

    setUploading(true);
    try {
      const presignRes = await fetch("/api/r2/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error ?? "No se pudo preparar la subida.");

      const putRes = await fetch(presign.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Falló la subida del archivo.");

      await addFileMaterial(sessionId, {
        title: title || file.name,
        fileKey: presign.key,
        fileSize: file.size,
        mimeType: file.type,
      });

      toast.success("Material subido.");
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir el material.");
    } finally {
      setUploading(false);
    }
  }

  function onAddLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await addLinkMaterial(sessionId, { title: linkTitle, externalUrl: linkUrl });
        toast.success("Enlace agregado.");
        setLinkTitle("");
        setLinkUrl("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo agregar el enlace.");
      }
    });
  }

  function onDelete(materialId: string) {
    startTransition(async () => {
      try {
        await deleteMaterial(materialId);
        toast.success("Material eliminado.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo eliminar el material.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      {materials.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {materials.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2">
              <span>{m.title}</span>
              <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => onDelete(m.id)}>
                Borrar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          className={tab === "archivo" ? "font-medium text-primary" : "text-muted-foreground"}
          onClick={() => setTab("archivo")}
        >
          Archivo
        </button>
        <button
          type="button"
          className={tab === "enlace" ? "font-medium text-primary" : "text-muted-foreground"}
          onClick={() => setTab("enlace")}
        >
          Enlace
        </button>
      </div>

      {tab === "archivo" ? (
        <form onSubmit={onUpload} className="flex items-center gap-2">
          <Input name="title" placeholder="Título (opcional)" className="h-8" />
          <input ref={fileInputRef} type="file" className="text-sm" />
          <Button type="submit" size="sm" disabled={uploading}>
            {uploading ? "Subiendo..." : "Subir"}
          </Button>
        </form>
      ) : (
        <form onSubmit={onAddLink} className="flex items-center gap-2">
          <Input
            placeholder="Título"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            className="h-8"
            required
          />
          <Input
            placeholder="https://..."
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="h-8"
            required
          />
          <Button type="submit" size="sm" disabled={isPending}>
            Agregar
          </Button>
        </form>
      )}
    </div>
  );
}
