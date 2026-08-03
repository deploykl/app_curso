"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Código copiado.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar el código.");
    }
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={onClick} aria-label="Copiar código">
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </Button>
  );
}
