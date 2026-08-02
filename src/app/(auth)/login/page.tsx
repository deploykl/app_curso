"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role } from "@/modules/auth/guards";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const res = await signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    setLoading(false);
    if (res.error) return setError(res.error.message ?? "No pudimos iniciar sesión.");

    // Volver a donde el usuario venía (?redirect=/cursos/algo). Se lee de
    // window en vez de useSearchParams para no forzar render dinámico de /login.
    // Solo rutas internas: un destino absoluto sería un open redirect.
    const dest = new URLSearchParams(window.location.search).get("redirect");
    if (dest && dest.startsWith("/") && !dest.startsWith("//")) return router.push(dest);

    const role = (res.data?.user as { role?: Role } | undefined)?.role;
    if (role === "admin") router.push("/admin/pagos");
    else if (role === "instructor") router.push("/instructor");
    else router.push("/mi-aprendizaje");
  }

  return (
    <div className="glass rounded-2xl p-8">
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-foreground">Iniciar sesión</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Entra para ver tus clases, materiales y certificados.
      </p>

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Correo"
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Contraseña"
              className="h-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" size="xl" disabled={loading} className="mt-1 w-full">
          {loading && <Loader2Icon className="animate-spin" />}
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Aún no tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-primary hover:underline">
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}
