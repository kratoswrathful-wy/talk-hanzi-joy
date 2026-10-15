import AssigneeTag from "@/components/AssigneeTag";
import { useSelectOptions } from "@/stores/select-options-store";
import type { CaseListPerson } from "@/lib/collab-translator-list";

export default function CaseListPeopleCell({ people }: { people: CaseListPerson[] }) {
  const { options } = useSelectOptions("assignee");
  if (!people.length) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-1 py-0.5">
      {people.map((person, index) => {
        const byId = person.userId ? options.find((o) => o.id === person.userId) : undefined;
        const byLabel = options.find((o) => o.label === person.label);
        const opt = byId || byLabel;
        return (
          <AssigneeTag
            key={person.userId ? person.userId : `${person.label}-${index}`}
            label={person.label}
            avatarUrl={opt?.avatarUrl}
            wrap
          />
        );
      })}
    </div>
  );
}
