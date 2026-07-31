"use client";
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatLima } from "@/lib/datetime";
import { deleteClassSession, reorderClassSessions, setRecordingUrl } from "@/modules/catalog/session-actions";
import { SessionForm } from "./session-form";

export interface SessionRow {
  id: string;
  title: string;
  descriptionMd: string | null;
  startsAt: string | Date;
  durationMinutes: number;
  zoomUrl: string | null;
  recordingUrl: string | null;
  isFreePreview: boolean;
}

function toLocalInputValue(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function RecordingCell({ sessionId, recordingUrl }: { sessionId: string; recordingUrl: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(recordingUrl ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        await setRecordingUrl(sessionId, value);
        toast.success("Grabación guardada.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar la grabación.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://..."
        className="h-8 w-48"
      />
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={save}>
        Guardar
      </Button>
    </div>
  );
}

export function SessionList({ courseId, sessions }: { courseId: string; sessions: SessionRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sessions.length) return;
    const ids = sessions.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    startTransition(async () => {
      await reorderClassSessions(courseId, ids);
      router.refresh();
    });
  }

  function remove(sessionId: string) {
    startTransition(async () => {
      try {
        await deleteClassSession(sessionId);
        toast.success("Sesión eliminada.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar la sesión.");
      }
    });
  }

  if (sessions.length === 0) {
    return <p className="text-muted-foreground">Todavía no hay sesiones.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº</TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Fecha y hora (Lima)</TableHead>
            <TableHead>Duración</TableHead>
            <TableHead>Zoom</TableHead>
            <TableHead>Grabación</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s, i) => {
            const startsAt = new Date(s.startsAt);
            return (
              <Fragment key={s.id}>
                <TableRow>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    {s.title}
                    {s.isFreePreview && <Badge variant="secondary" className="ml-2">Preview</Badge>}
                  </TableCell>
                  <TableCell>{formatLima(startsAt)}</TableCell>
                  <TableCell>{s.durationMinutes} min</TableCell>
                  <TableCell>{s.zoomUrl ? "✓" : "—"}</TableCell>
                  <TableCell>
                    <RecordingCell sessionId={s.id} recordingUrl={s.recordingUrl} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="icon-sm" variant="ghost" disabled={isPending || i === 0} onClick={() => move(i, -1)}>
                        ↑
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" disabled={isPending || i === sessions.length - 1} onClick={() => move(i, 1)}>
                        ↓
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(editingId === s.id ? null : s.id)}>
                        Editar
                      </Button>
                      <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => remove(s.id)}>
                        Borrar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {editingId === s.id && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <SessionForm
                        courseId={courseId}
                        sessionId={s.id}
                        initialValues={{
                          title: s.title,
                          descriptionMd: s.descriptionMd,
                          startsAtLocal: toLocalInputValue(startsAt),
                          durationMinutes: s.durationMinutes,
                          zoomUrl: s.zoomUrl,
                          isFreePreview: s.isFreePreview,
                        }}
                        onDone={() => setEditingId(null)}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
