"use client";

import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // Los dos iconos se renderizan siempre y es el CSS quien decide cuál se ve,
  // así que el HTML del servidor y el del cliente coinciden sin guardas de
  // montaje: la clase .dark del <html> ya lleva la información del tema.
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Cambiar entre tema claro y oscuro"
      className="text-muted-foreground hover:text-foreground"
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}
