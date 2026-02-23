import { FolderKanban, ListChecks, Clock, CheckCircle2 } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { ProjectCard } from "@/components/ProjectCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { projects, tasks } from "@/data/mock-data";
import { motion } from "framer-motion";

export default function Dashboard() {
  const totalTasks = tasks.length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const completed = tasks.filter((t) => t.status === "done").length;
  const recentTasks = tasks
    .filter((t) => t.status !== "done")
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">儀表板</h1>
        <p className="mt-1 text-sm text-muted-foreground">專案與任務總覽</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="專案數" value={projects.length} icon={FolderKanban} />
        <StatCard title="總任務數" value={totalTasks} icon={ListChecks} />
        <StatCard title="進行中" value={inProgress} icon={Clock} trend={`${Math.round((inProgress / totalTasks) * 100)}% 的任務`} />
        <StatCard title="已完成" value={completed} icon={CheckCircle2} trend={`${Math.round((completed / totalTasks) * 100)}% 完成率`} />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium">專案</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium">待處理任務</h2>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="rounded-xl border border-border bg-card"
        >
          <div className="divide-y divide-border">
            {recentTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted-foreground font-mono">
                    {task.id}
                  </span>
                  <span className="truncate text-sm text-card-foreground">
                    {task.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
