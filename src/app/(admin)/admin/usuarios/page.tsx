import { CreateUserForm } from "@/modules/users/ui/create-user-form";
import { UsersTable } from "@/modules/users/ui/users-table";
import { listarUsuarios } from "@/modules/users/queries";
import { requireUser } from "@/modules/auth/session";

export default async function AdminUsuariosPage() {
  const [me, usuarios] = await Promise.all([requireUser(), listarUsuarios()]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="text-muted-foreground text-sm">
          Crea cuentas de alumno, instructor o administrador con acceso inmediato.
        </p>
        <CreateUserForm />
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Usuarios registrados ({usuarios.length})</h2>
        <p className="text-muted-foreground text-xs">
          Desactivar bloquea el acceso sin borrar cursos, órdenes ni certificados del usuario.
        </p>
        <UsersTable usuarios={usuarios} currentUserId={me.id} />
      </div>
    </div>
  );
}
