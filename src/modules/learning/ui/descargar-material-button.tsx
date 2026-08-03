"use client";
import { useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getMaterialDownloadUrl } from "@/modules/materials/actions";

export function DescargarMaterialButton({ materialId, title }: { materialId: string; title: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      const url = await getMaterialDownloadUrl(materialId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descargar el material.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={loading}
      className="w-full justify-start gap-2 overflow-hidden"
    >
      <FileText className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{loading ? "Preparando..." : title}</span>
    </Button>
  );
}
