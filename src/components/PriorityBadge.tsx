import { cn } from "@/lib/utils";
import type { TaskPriority } from "@/data/mock-data";
import { priorityLabels } from "@/data/mock-data";

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/15 text-info",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        priorityStyles[priority]
      )}
    >
      {priorityLabels[priority]}
    </span>
  );
}
