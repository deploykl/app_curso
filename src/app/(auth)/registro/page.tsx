"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { signUp } from "@/lib/auth-client";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegistroPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!token) return setError("Completa la verificación de seguridad.");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const res = await signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
      fetchOptions: { headers: { "x-captcha-response": token } },
    });

    setLoading(false);
    if (res.error) return setError(res.error.message ?? "No pudimos crear tu cuenta.");
    router.push("/verificar-email");
  }

  return (
    <div className="glass rounded-2xl p-8">
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-foreground">Crear cuenta</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Es gratis. Pagas solo cuando te inscribes a un curso.
      </p>

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nombre completo</Label>
          <Input
            id="name"
            name="name"
            required
            autoComplete="name"
            placeholder="Nombre completo"
            className="h-10"
          />
        </div>

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
              minLength={8}
              autoComplete="new-password"
              placeholder="Contraseña (mín. 8)"
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

        <TurnstileWidget onToken={setToken} />

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
          {loading ? "Creando..." : "Crear cuenta"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Iniciar sesión
        </Link>
      </p>
    </div>
  );
}
