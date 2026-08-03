"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FileInput = forwardRef<
  HTMLInputElement,
  {
    id: string;
    accept?: string;
    hint?: string;
    onFileChange?: (file: File | null) => void;
    className?: string;
  }
>(function FileInput({ id, accept, hint, onFileChange, className }, ref) {
  const innerRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

  function pick() {
    innerRef.current?.click();
  }

  function setSelected(f: File | null) {
    setFile(f);
    onFileChange?.(f);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelected(e.target.files?.[0] ?? null);
  }

  function clear() {
    if (innerRef.current) innerRef.current.value = "";
    setSelected(null);
  }

  function onDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped || !innerRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(dropped);
    innerRef.current.files = dt.files;
    setSelected(dropped);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <input ref={innerRef} id={id} type="file" accept={accept} onChange={onChange} className="sr-only" />

      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{fileSizeLabel(file.size)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={pick} className="text-xs font-medium text-primary hover:underline">
              Cambiar
            </button>
            <button
              type="button"
              onClick={clear}
              aria-label="Quitar archivo"
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors",
            dragging
              ? "border-primary bg-primary/5 text-foreground"
              : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
          )}
        >
          <Upload className="size-5" />
          <span>
            <span className="font-medium text-primary">Elige un archivo</span> o arrástralo aquí
          </span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </button>
      )}
    </div>
  );
});
