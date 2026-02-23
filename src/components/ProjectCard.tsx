import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import type { Project } from "@/data/mock-data";

export function ProjectCard({ project, index }: { project: Project; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link
        to={`/projects/${project.id}`}
        className="group block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-secondary/50"
      >
        <div className="mb-3 flex items-center gap-3">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <h3 className="font-medium text-card-foreground group-hover:text-primary transition-colors">
            {project.name}
          </h3>
        </div>

        <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
          {project.description}
        </p>

        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {project.completedTasks} / {project.taskCount} 任務
          </span>
          <span>{project.progress}%</span>
        </div>
        <Progress value={project.progress} className="h-1.5" />

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>負責人：{project.lead}</span>
          <span>{project.updatedAt}</span>
        </div>
      </Link>
    </motion.div>
  );
}
