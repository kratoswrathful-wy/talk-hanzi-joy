import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DevRoleSwitcher } from "@/components/DevRoleSwitcher";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";

function SidebarAutoController() {
  const location = useLocation();
  const { setOpen } = useSidebar();
  const lastAreaRef = useRef<"lms" | "catModule" | "catEditor" | "other">("other");

  useEffect(() => {
    const path = location.pathname || "";
    const isCat = path.startsWith("/cat/");
    const isCatEditor = isCat && path.includes("/files/");
    const isCatModule = isCat && !isCatEditor;
    const isLms = !isCat;

    const nextArea: typeof lastAreaRef.current = isLms
      ? "lms"
      : isCatEditor
        ? "catEditor"
        : isCatModule
          ? "catModule"
          : "other";

    const prevArea = lastAreaRef.current;
    lastAreaRef.current = nextArea;

    // LMS sidebar: route-driven (no sticky manual state). Exception: CAT module <-> editor
    // still forces a re-run so iframe sidebar mode can re-apply.
    const isForcedCatBoundary =
      (prevArea === "catModule" && nextArea === "catEditor") ||
      (prevArea === "catEditor" && nextArea === "catModule");

    if (!isForcedCatBoundary && prevArea === nextArea) return;

    if (nextArea === "lms") {
      setOpen(true);
    } else if (nextArea === "catModule" || nextArea === "catEditor") {
      setOpen(false);
    }
  }, [location.pathname, setOpen]);

  return null;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isRealExecutive, isTestAccount } = useAuth();
  // 測試模式面板：真人執行長（入口）或測試帳號（切換/離開）時顯示。
  const showTestModePanel = isRealExecutive || isTestAccount;
  return (
    <SidebarProvider>
      <SidebarAutoController />
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          {/* 測試模式常駐警示條：避免誤把測試資料當正式操作 */}
          {isTestAccount && (
            <div className="bg-amber-500 px-4 py-1 text-center text-xs font-medium text-amber-950">
              測試模式 — 目前所有操作都在測試環境，與正式資料隔離
            </div>
          )}
          <header className="flex h-12 items-center border-b border-border px-4">
            <SidebarTrigger />
          </header>
          {showTestModePanel && (
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
