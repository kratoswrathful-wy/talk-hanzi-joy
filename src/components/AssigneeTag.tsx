import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface AssigneeTagProps {
  label: string;
  avatarUrl?: string | null;
  size?: "sm" | "md";
  onClick?: () => void;
}

/**
 * Black-background tag with avatar + display name for translator/assignee display.
 */
export default function AssigneeTag({ label, avatarUrl, size = "sm", onClick }: AssigneeTagProps) {
  const avatarSize = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const textSize = size === "sm" ? "text-xs" : "text-xs";
  const padding = size === "sm" ? "pl-0.5 pr-2 py-0.5" : "pl-0.5 pr-2.5 py-0.5";

  return (
    <span
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full ${padding} ${textSize} font-medium ${onClick ? "cursor-pointer hover:opacity-80" : ""}`}
      style={{ backgroundColor: "#1a1a1a", color: "#D1DAEA" }}
    >
      <Avatar className={avatarSize}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt={label} />}
        <AvatarFallback className="text-[8px] bg-muted-foreground/30 text-foreground">
          {label.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{label}</span>
    </span>
  );
}
