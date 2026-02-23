import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { projects, tasks } from "@/data/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";

export default function ProjectDetail() {
  const { id } = useParams();
  const project = projects.find((p) => p.id === id);
  const projectTasks = tasks.filter((t) => t.projectId === id);

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">找不到該專案</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        返回專案
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border bg-card p-6"
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="h-3.5 w-3.5 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <h1 className="text-xl font-semibold text-card-foreground">
            {project.name}
          </h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{project.description}</p>

        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{project.completedTasks} / {project.taskCount} 任務已完成</span>
          <span>{project.progress}%</span>
        </div>
        <Progress value={project.progress} className="h-1.5" />

        <div className="mt-4 flex gap-6 text-xs text-muted-foreground">
          <span>負責人：{project.lead}</span>
          <span>最後更新：{project.updatedAt}</span>
        </div>
      </motion.div>

      <div>
        <h2 className="mb-3 text-lg font-medium">任務列表</h2>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-border bg-card"
        >
          {projectTasks.length === 0 ? (
            <p className="p-5 text-center text-sm text-muted-foreground">
              尚無任務
            </p>
          ) : (
            <div className="divide-y divide-border">
              {projectTasks.map((task) => (
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
                    {task.assignee && (
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {task.assignee}
                      </span>
                    )}
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
