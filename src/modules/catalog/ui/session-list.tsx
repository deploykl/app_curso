"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, ChevronUp, Clock, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatLima } from "@/lib/datetime";
import { deleteClassSession, reorderClassSessions, setRecordingUrl } from "@/modules/catalog/session-actions";
import { MaterialManager, type MaterialRow } from "@/modules/materials/ui/material-manager";
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
  materials: MaterialRow[];
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

function RecordingField({ sessionId, recordingUrl }: { sessionId: string; recordingUrl: string | null }) {
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
        placeholder="Enlace de la grabación (https://...)"
        className="h-8"
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
  const [materialsId, setMaterialsId] = useState<string | null>(null);
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
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Todavía no hay sesiones. Agrega la primera abajo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {sessions.map((s, i) => {
        const startsAt = new Date(s.startsAt);
        const isEditing = editingId === s.id;
        const isMaterials = materialsId === s.id;

        return (
          <div key={s.id} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center gap-3 p-3">
              <div className="flex flex-col gap-0.5">
                <Button
                  type="button" size="icon-sm" variant="ghost" className="h-4"
                  disabled={isPending || i === 0} onClick={() => move(i, -1)}
                  aria-label="Subir"
                >
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button
                  type="button" size="icon-sm" variant="ghost" className="h-4"
                  disabled={isPending || i === sessions.length - 1} onClick={() => move(i, 1)}
                  aria-label="Bajar"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </div>

              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold text-muted-foreground">
                {i + 1}
              </div>

              <div className="min-w-40 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{s.title}</span>
                  {s.isFreePreview && <Badge variant="secondary">Preview</Badge>}
                  {s.recordingUrl && <Badge className="bg-success/15 text-success">Grabada</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5 opacity-60" />
                    {formatLima(startsAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5 opacity-60" />
                    {s.durationMinutes} min
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Video className="size-3.5 opacity-60" />
                    {s.zoomUrl ? "Enlace listo" : "Sin enlace"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => { setMaterialsId(isMaterials ? null : s.id); setEditingId(null); }}
                >
                  Materiales ({s.materials.length})
                </Button>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => { setEditingId(isEditing ? null : s.id); setMaterialsId(null); }}
                >
                  Editar
                </Button>
                <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => remove(s.id)}>
                  Borrar
                </Button>
              </div>
            </div>

            {!isEditing && !isMaterials && (
              <div className="border-t border-border bg-muted/30 px-3 py-2">
                <RecordingField sessionId={s.id} recordingUrl={s.recordingUrl} />
              </div>
            )}

            {isMaterials && (
              <div className="border-t border-border p-3">
                <MaterialManager sessionId={s.id} materials={s.materials} />
              </div>
            )}

            {isEditing && (
              <div className="border-t border-border p-3">
                <SessionForm
                  courseId={courseId}
                  sessionId={s.id}
                  initialValues={{
                    title: s.title,
                    startsAtLocal: toLocalInputValue(startsAt),
                    durationMinutes: s.durationMinutes,
                    zoomUrl: s.zoomUrl,
                    isFreePreview: s.isFreePreview,
                  }}
                  onDone={() => setEditingId(null)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
