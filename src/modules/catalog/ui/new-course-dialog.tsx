"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { CourseForm } from "@/modules/catalog/ui/course-form";

interface Category {
  id: string;
  name: string;
}

export function NewCourseDialog({
  categories,
  triggerLabel = "Nuevo curso",
  triggerClassName,
}: {
  categories: Category[];
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({ className: triggerClassName ?? "gap-1.5" })}
      >
        <Plus className="size-4" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo curso</DialogTitle>
        </DialogHeader>
        <CourseForm categories={categories} />
      </DialogContent>
    </Dialog>
  );
}
