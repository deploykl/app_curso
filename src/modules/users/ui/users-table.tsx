import { Badge } from "@/components/ui/badge";
import { formatLima } from "@/lib/datetime";
import { UserRowActions } from "./user-row-actions";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  instructor: "Instructor",
  student: "Alumno",
};

export function UsersTable({
  usuarios,
  currentUserId,
}: {
  usuarios: {
    id: string;
    name: string;
    email: string;
    role: string | null;
    active: boolean;
    createdAt: Date;
    commissionRate: number | null;
  }[];
  currentUserId: string;
}) {
  if (usuarios.length === 0) {
    return <p className="text-muted-foreground text-sm">Todavía no hay usuarios registrados.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-4 py-2 font-medium">Nombre</th>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium">Creado</th>
            <th className="px-4 py-2 font-medium">Rol / acceso</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2">{u.name}</td>
              <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
              <td className="px-4 py-2">
                <Badge variant={u.active ? "outline" : "destructive"}>
                  {u.active ? "Activo" : "Desactivado"}
                </Badge>
              </td>
              <td className="px-4 py-2 text-muted-foreground">{formatLima(u.createdAt)}</td>
              <td className="px-4 py-2">
                {u.id === currentUserId ? (
                  <Badge variant="outline">{ROLE_LABEL[u.role ?? ""] ?? u.role} (tú)</Badge>
                ) : (
                  <UserRowActions
                    userId={u.id}
                    role={u.role ?? "student"}
                    active={u.active}
                    commissionRate={u.commissionRate}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
