import { tasks, projects } from "@/data/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export default function Tasks() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">所有任務</h1>
        <p className="mt-1 text-sm text-muted-foreground">跨專案的任務總覽</p>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card"
      >
        <div className="divide-y divide-border">
          {tasks.map((task) => {
            const project = projects.find((p) => p.id === task.projectId);
            return (
              <div
                key={task.id}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">
                    {task.id}
                  </span>
                  <span className="truncate text-sm text-card-foreground">
                    {task.title}
                  </span>
                  {project && (
                    <Link
                      to={`/projects/${project.id}`}
                      className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      {project.name}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {task.assignee && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {task.assignee}
                    </span>
                  )}
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} />
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
