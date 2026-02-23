import { ProjectCard } from "@/components/ProjectCard";
import { projects } from "@/data/mock-data";

export default function Projects() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">專案</h1>
        <p className="mt-1 text-sm text-muted-foreground">所有進行中的專案</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((project, i) => (
          <ProjectCard key={project.id} project={project} index={i} />
        ))}
      </div>
    </div>
  );
}
