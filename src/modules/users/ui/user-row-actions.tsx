"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  actualizarRolUsuarioAction,
  establecerActivoUsuarioAction,
  establecerComisionInstructorAction,
} from "@/modules/users/actions";

const ROLES = [
  { value: "student", label: "Alumno" },
  { value: "instructor", label: "Instructor" },
  { value: "admin", label: "Administrador" },
] as const;

export function UserRowActions({
  userId,
  role,
  active,
  commissionRate,
}: {
  userId: string;
  role: string;
  active: boolean;
  commissionRate: number | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [comision, setComision] = useState(commissionRate?.toString() ?? "");

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

  function guardarComision() {
    const rate = Number(comision);
    if (!Number.isFinite(rate)) return toast.error("Ingresa un porcentaje válido.");
    if (rate === commissionRate) return;
    startTransition(async () => {
      try {
        await establecerComisionInstructorAction(userId, rate);
        toast.success("Comisión actualizada.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar la comisión.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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

      {(role === "instructor" || role === "admin") && commissionRate !== null && (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Comisión
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={comision}
            disabled={isPending}
            onChange={(e) => setComision(e.target.value)}
            onBlur={guardarComision}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-right text-xs text-foreground"
          />
          %
        </label>
      )}

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
