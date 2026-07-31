"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    router.push("/mi-aprendizaje");
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-sm flex-col gap-4 py-12">
      <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
      <input name="email" type="email" required placeholder="Correo" className="rounded border p-2" />
      <input name="password" type="password" required placeholder="Contraseña" className="rounded border p-2" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} className="rounded bg-black p-2 text-white disabled:opacity-50">
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
