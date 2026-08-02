"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearUsuarioAction } from "@/modules/users/actions";

const ROLES = [
  { value: "student", label: "Alumno" },
  { value: "instructor", label: "Instructor" },
  { value: "admin", label: "Administrador" },
] as const;

export function CreateUserForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student" as const });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await crearUsuarioAction(form);
        toast.success(`Cuenta creada: ${form.email}`);
        setForm({ name: "", email: "", password: "", role: "student" });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo crear el usuario.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 max-w-md">
      <Input
        placeholder="Nombre completo"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
      />
      <Input
        type="email"
        placeholder="correo@ejemplo.com"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
      />
      <Input
        type="password"
        placeholder="Contraseña inicial (mín. 8 caracteres)"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        required
        minLength={8}
      />
      <select
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        value={form.role}
        onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear cuenta"}
      </Button>
    </form>
  );
}
