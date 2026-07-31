import Link from "next/link";
import { requireUser } from "@/modules/auth/session";
import { listInstructorCourses } from "@/modules/catalog/queries";
import { formatPEN } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
};

export default async function InstructorCoursesPage() {
  const u = await requireUser();
  const cursos = await listInstructorCourses(u.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mis cursos</h1>
        <Link href="/instructor/cursos/nuevo" className={buttonVariants()}>
          Nuevo curso
        </Link>
      </div>

      {cursos.length === 0 ? (
        <p className="text-muted-foreground">Todavía no tienes cursos. Crea el primero.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Sesiones</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cursos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.title}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "published" ? "default" : "secondary"}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatPEN(c.priceCents)}</TableCell>
                  <TableCell>{c.sessionCount}</TableCell>
                  <TableCell>
                    <Link href={`/instructor/cursos/${c.id}`} className="text-primary hover:underline">
                      Editar
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
