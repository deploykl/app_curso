"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { actualizarRolUsuarioAction, establecerActivoUsuarioAction } from "@/modules/users/actions";

const ROLES = [
  { value: "student", label: "Alumno" },
  { value: "instructor", label: "Instructor" },
  { value: "admin", label: "Administrador" },
] as const;

export function UserRowActions({
  userId,
  role,
  active,
}: {
  userId: string;
  role: string;
  active: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function cambiarRol(nuevoRol: string) {
    startTransition(async () => {
      try {
        await actualizarRolUsuarioAction(userId, nuevoRol as (typeof ROLES)[number]["value"]);
        toast.success("Rol actualizado.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar el rol.");
      }
    });
  }

  function alternarActivo() {
    startTransition(async () => {
      try {
        await establecerActivoUsuarioAction(userId, !active);
        toast.success(active ? "Cuenta desactivada." : "Cuenta reactivada.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar la cuenta.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
        value={role}
        disabled={isPending}
        onChange={(e) => cambiarRol(e.target.value)}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant={active ? "destructive" : "outline"}
        size="sm"
        disabled={isPending}
        onClick={alternarActivo}
      >
        {active ? "Desactivar" : "Reactivar"}
      </Button>
    </div>
  );
}
