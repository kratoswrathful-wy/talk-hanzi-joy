import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/data/mock-data";
import { statusLabels } from "@/data/mock-data";

const statusStyles: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/15 text-primary",
  done: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status]
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
