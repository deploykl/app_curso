"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { TurnstileWidget } from "@/components/turnstile-widget";

export default function RegistroPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <form onSubmit={onSubmit} className="mx-auto flex max-w-sm flex-col gap-4 py-12">
      <h1 className="text-2xl font-semibold">Crear cuenta</h1>
      <input name="name" required placeholder="Nombre completo" className="rounded border p-2" />
      <input name="email" type="email" required placeholder="Correo" className="rounded border p-2" />
      <input name="password" type="password" required minLength={8}
             placeholder="Contraseña (mín. 8)" className="rounded border p-2" />
      <TurnstileWidget onToken={setToken} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} className="rounded bg-black p-2 text-white disabled:opacity-50">
        {loading ? "Creando..." : "Crear cuenta"}
      </button>
    </form>
  );
}
