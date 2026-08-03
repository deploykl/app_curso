"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatLima } from "@/lib/datetime";
import { deleteClassSession, reorderClassSessions, setRecordingUrl, updateClassSession } from "@/modules/catalog/session-actions";
import { MaterialManager, type MaterialRow } from "@/modules/materials/ui/material-manager";
import { SessionForm } from "./session-form";

export interface SessionRow {
  id: string;
  title: string;
  descriptionMd: string | null;
  startsAt: string | Date | null;
  durationMinutes: number;
  zoomUrl: string | null;
  recordingUrl: string | null;
  videoFileKey: string | null;
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

function shortDate(date: Date): string {
  return formatLima(date).replace(",", " ·");
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

function VideoUploadField({
  sessionId, hasVideo, durationMinutes,
}: {
  sessionId: string; hasVideo: boolean; durationMinutes: number;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("Selecciona un video.");
      return;
    }
    setUploading(true);
    try {
      const presignRes = await fetch("/api/r2/session-video-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error ?? "No se pudo preparar la subida.");

      const putRes = await fetch(presign.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Falló la subida del video.");

      await updateClassSession(sessionId, { videoFileKey: presign.key, durationMinutes });
      toast.success("Video subido.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir el video.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="min-w-0 flex-1 text-xs" />
      <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={upload}>
        {uploading ? "Subiendo..." : hasVideo ? "Reemplazar" : "Subir video"}
      </Button>
    </div>
  );
}

export function SessionList({
  courseId,
  deliveryMode = "en_vivo",
  sessions,
}: {
  courseId: string;
  deliveryMode?: "en_vivo" | "grabado";
  sessions: SessionRow[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [materialsId, setMaterialsId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(sessions.length === 0);
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Sesiones {sessions.length > 0 && <span className="text-muted-foreground">· {sessions.length}</span>}
        </h3>
        <Button
          type="button" size="icon-sm" variant="outline"
          aria-label="Nueva sesión"
          onClick={() => setAddOpen((v) => !v)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {sessions.length === 0 && !addOpen && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Todavía no hay sesiones.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {sessions.map((s, i) => {
          const startsAt = s.startsAt ? new Date(s.startsAt) : null;
          const isEditing = editingId === s.id;
          const isMaterials = materialsId === s.id;
          const needsAttention = deliveryMode === "en_vivo" ? !s.zoomUrl : !s.videoFileKey;

          return (
            <div key={s.id} className="overflow-hidden rounded-lg border border-border bg-background">
              <div className="flex items-center gap-2 p-2">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button" disabled={isPending || i === 0} onClick={() => move(i, -1)}
                    aria-label="Subir" className="h-3.5 text-muted-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button" disabled={isPending || i === sessions.length - 1} onClick={() => move(i, 1)}
                    aria-label="Bajar" className="h-3.5 text-muted-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </div>

                <div className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-[0.7rem] font-bold text-secondary-foreground">
                  {i + 1}
                </div>

                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => { setEditingId(isEditing ? null : s.id); setMaterialsId(null); }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold">{s.title}</span>
                    {s.isFreePreview && <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[0.6rem]">Preview</Badge>}
                  </div>
                  <span className="text-[0.68rem] text-muted-foreground">
                    {startsAt ? `${shortDate(startsAt)} · ` : ""}{s.durationMinutes} min
                  </span>
                </button>

                <span
                  className={`size-1.5 shrink-0 rounded-full ${needsAttention ? "bg-warning" : "bg-success"}`}
                  title={
                    deliveryMode === "en_vivo"
                      ? needsAttention ? "Falta el enlace de Zoom" : "Enlace de Zoom listo"
                      : needsAttention ? "Falta subir el video" : "Video listo"
                  }
                />

                <Button
                  type="button" size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-[0.72rem]"
                  onClick={() => { setMaterialsId(isMaterials ? null : s.id); setEditingId(null); }}
                >
                  Materiales{s.materials.length > 0 ? ` (${s.materials.length})` : ""}
                </Button>
              </div>

              {isMaterials && (
                <div className="border-t border-border p-3">
                  <MaterialManager sessionId={s.id} materials={s.materials} />
                </div>
              )}

              {isEditing && (
                <div className="border-t border-border p-3">
                  <div className="mb-3">
                    {deliveryMode === "en_vivo" ? (
                      <RecordingField sessionId={s.id} recordingUrl={s.recordingUrl} />
                    ) : (
                      <VideoUploadField sessionId={s.id} hasVideo={Boolean(s.videoFileKey)} durationMinutes={s.durationMinutes} />
                    )}
                  </div>
                  <SessionForm
                    courseId={courseId}
                    sessionId={s.id}
                    deliveryMode={deliveryMode}
                    initialValues={{
                      descriptionMd: s.descriptionMd,
                      startsAtLocal: startsAt ? toLocalInputValue(startsAt) : undefined,
                      durationMinutes: s.durationMinutes,
                      zoomUrl: s.zoomUrl,
                      isFreePreview: s.isFreePreview,
                    }}
                    onDone={() => setEditingId(null)}
                  />
                  <Button
                    type="button" size="sm" variant="destructive" className="mt-2" disabled={isPending}
                    onClick={() => remove(s.id)}
                  >
                    Borrar sesión
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {addOpen && (
        <>
          {deliveryMode === "grabado" && (
            <p className="text-xs text-muted-foreground">
              Primero guarda la duración de la clase; el campo para subir el video aparece justo después.
            </p>
          )}
          <SessionForm
            courseId={courseId}
            deliveryMode={deliveryMode}
            onDone={(createdSessionId) => {
              setAddOpen(false);
              if (deliveryMode === "grabado" && createdSessionId) setEditingId(createdSessionId);
            }}
          />
        </>
      )}
    </div>
  );
}
