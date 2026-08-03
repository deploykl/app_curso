"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { attachCourseVideo } from "@/modules/catalog/session-actions";

export function CourseVideoField({
  courseId,
  hasVideo,
  durationMinutes,
}: {
  courseId: string;
  hasVideo: boolean;
  durationMinutes: number;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [duration, setDuration] = useState(String(durationMinutes || 60));
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("Selecciona un video.");
      return;
    }
    setUploading(true);
    try {
      const presignRes = await fetch("/api/r2/course-video-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error ?? "No se pudo preparar la subida.");

      const putRes = await fetch(presign.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Falló la subida del video.");

      await attachCourseVideo(courseId, { videoFileKey: presign.key, durationMinutes: Number(duration) || 60 });
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
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Video className="size-4 text-muted-foreground" />
        Video del curso
        {hasVideo && <span className="text-xs font-normal text-success">· subido</span>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="courseVideoDuration" className="text-xs text-muted-foreground">Duración (min)</Label>
          <Input
            id="courseVideoDuration"
            type="number"
            min={1}
            max={480}
            className="h-8 w-24"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="min-w-0 flex-1 text-xs"
        />
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={upload}>
          {uploading ? "Subiendo..." : hasVideo ? "Reemplazar video" : "Subir video"}
        </Button>
      </div>
    </div>
  );
}
