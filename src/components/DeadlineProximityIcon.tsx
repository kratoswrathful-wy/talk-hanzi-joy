import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DeadlineProximityIconProps {
  deadline: string | null;
}

export function DeadlineProximityIcon({ deadline }: DeadlineProximityIconProps) {
  if (!deadline) return null;

  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const diffHours = diffMs / 3600000;

  let emoji: string | null = null;
  let tooltipText = "";

  if (diffMs < 0) {
    // Overdue
    emoji = "🚨";
    tooltipText = "已逾期！注意！";
  } else if (diffHours <= 2) {
    emoji = "🚀";
    tooltipText = `交期將近，還有 ${formatRemaining(diffMinutes)}，請注意進度喔！`;
  } else if (diffHours <= 6) {
    emoji = "🚅";
    tooltipText = `交期將近，還有 ${formatRemaining(diffMinutes)}，請注意進度喔！`;
  } else if (diffHours <= 12) {
    emoji = "🏍️";
    tooltipText = `交期將近，還有 ${formatRemaining(diffMinutes)}，請注意進度喔！`;
  } else if (diffHours <= 24) {
    emoji = "⌚";
    tooltipText = `交期將近，還有 ${formatRemaining(diffMinutes)}，請注意進度喔！`;
  }

  if (!emoji) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block text-lg leading-none cursor-default ml-0.5">{emoji}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatRemaining(totalMinutes: number): string {
  if (totalMinutes < 0) return "0 分鐘";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) return `${hours} 小時 ${mins} 分鐘`;
  return `${mins} 分鐘`;
}
