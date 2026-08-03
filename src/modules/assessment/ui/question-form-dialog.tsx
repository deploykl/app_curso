"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { QuestionForm, type QuestionFormValues } from "./question-form";

export function QuestionFormDialog({
  courseId,
  questionId,
  initialValues,
}: {
  courseId: string;
  questionId?: string;
  initialValues?: QuestionFormValues;
}) {
  const [open, setOpen] = useState(false);
  const esEdicion = Boolean(questionId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {esEdicion ? (
        <DialogTrigger
          aria-label="Editar pregunta"
          title="Editar pregunta"
          render={<Button type="button" variant="outline" size="icon" />}
        >
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger className={buttonVariants({ className: "gap-1.5" })}>
          <Plus className="size-4" />
          Agregar pregunta
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{esEdicion ? "Editar pregunta" : "Agregar pregunta"}</DialogTitle>
        </DialogHeader>
        <QuestionForm
          courseId={courseId}
          questionId={questionId}
          initialValues={initialValues}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
