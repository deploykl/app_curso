"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Formulario de verificación de certificados.
 *
 * Es un GET normal a /verificar, que redirige a /verificar/[code]: funciona sin
 * JavaScript y también si alguien pulsa antes de que la página hidrate —el
 * landing se sirve prerenderizado—. El onSubmit solo adelanta la navegación por
 * el router cuando ya hay JS.
 *
 * Usa un <input> nativo y no el de components/ui: el de Base UI gobierna su
 * propio valor y al hidratar borra lo que el visitante ya hubiera escrito.
 */
export function VerifyCodeForm() {
  const router = useRouter();

  return (
    <form
      action="/verificar"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const raw = new FormData(e.currentTarget).get("codigo");
        const code = String(raw ?? "").trim().toUpperCase();
        if (!code) return;
        router.push(`/verificar/${encodeURIComponent(code)}`);
      }}
      className="flex flex-col gap-2.5 sm:flex-row"
    >
      <label htmlFor="codigo-certificado" className="sr-only">
        Código del certificado
      </label>
      <input
        id="codigo-certificado"
        name="codigo"
        placeholder="K7M4-P2XR"
        maxLength={16}
        autoComplete="off"
        spellCheck={false}
        className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 font-mono text-base tracking-[0.14em] uppercase transition-colors outline-none placeholder:text-muted-foreground placeholder:normal-case focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 sm:max-w-56"
      />
      {/* No se deshabilita: un CTA gris en mitad del landing se lee como roto.
          El submit vacío simplemente no navega. */}
      <Button type="submit" size="xl">
        Verificar certificado
      </Button>
    </form>
  );
}
