import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TableHorizontalScrollButtons({
  containerRef,
  className,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  return (
    <div className={className ?? "fixed right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1"}>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 bg-card shadow-md"
        onClick={() => containerRef.current?.scrollTo({ left: 0, behavior: "smooth" })}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 bg-card shadow-md"
        onClick={() =>
          containerRef.current?.scrollTo({ left: containerRef.current.scrollWidth, behavior: "smooth" })
        }
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

