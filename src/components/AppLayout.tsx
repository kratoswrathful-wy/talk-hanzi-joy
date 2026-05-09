import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DevRoleSwitcher } from "@/components/DevRoleSwitcher";
import { useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";

function SidebarAutoController() {
  const location = useLocation();
  const { setOpen } = useSidebar();
  const lastAreaRef = useRef<"lms" | "catTeamModule" | "catTeamEditor" | "other">("other");

  useEffect(() => {
    const path = location.pathname || "";
    const isCatTeam = path.startsWith("/cat/team");
    const isCatTeamEditor = isCatTeam && path.includes("/files/");
    const isCatTeamModule = isCatTeam && !isCatTeamEditor;
    const isLms = !path.startsWith("/cat/");

    const nextArea: typeof lastAreaRef.current = isLms
      ? "lms"
      : isCatTeamEditor
        ? "catTeamEditor"
        : isCatTeamModule
          ? "catTeamModule"
          : "other";

    const prevArea = lastAreaRef.current;
    lastAreaRef.current = nextArea;

    // Default: respect manual toggles within the same area.
    // Exception: CAT module <-> editor transitions must always enforce.
    const isForcedCatBoundary =
      (prevArea === "catTeamModule" && nextArea === "catTeamEditor") ||
      (prevArea === "catTeamEditor" && nextArea === "catTeamModule");

    if (!isForcedCatBoundary && prevArea === nextArea) return;

    if (nextArea === "lms") {
      setOpen(true);
    } else if (nextArea === "catTeamModule" || nextArea === "catTeamEditor") {
      setOpen(false);
    }
  }, [location.pathname, setOpen]);

  return null;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <SidebarAutoController />
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-12 items-center border-b border-border px-4">
            <SidebarTrigger />
          </header>
          {/* Dev-only: 分身切換（正式站 Vercel / Lovable 不顯示） */}
          {import.meta.env.DEV && (
            <div className="px-6 pt-3">
              <DevRoleSwitcher />
            </div>
          )}
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
