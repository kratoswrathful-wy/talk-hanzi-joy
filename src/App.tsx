import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeleteConfirmProvider } from "@/components/providers/DeleteConfirmProvider";
import { BrowserRouter, Routes, Route, Navigate, useParams, Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import AuthPage from "@/pages/AuthPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import TranslatorFees from "@/pages/TranslatorFees";
import NewTranslatorFee from "@/pages/NewTranslatorFee";
import TranslatorFeeDetail from "@/pages/TranslatorFeeDetail";
import SettingsPage from "@/pages/SettingsPage";
import ProfilePage from "@/pages/ProfilePage";
import MembersPage from "@/pages/MembersPage";
import PermissionsPage from "@/pages/PermissionsPage";
import InvoicesPage from "@/pages/InvoicesPage";
import InvoiceDetailPage from "@/pages/InvoiceDetailPage";
import ClientInvoicesPage from "@/pages/ClientInvoicesPage";
import ClientInvoiceDetailPage from "@/pages/ClientInvoiceDetailPage";
import CasesPage from "@/pages/CasesPage";
import CaseDetailPage from "@/pages/CaseDetailPage";
import ToolManagementPage from "@/pages/ToolManagementPage";
import PageTemplateEditorPage from "@/pages/PageTemplateEditorPage";
import FieldReferencePage from "@/pages/FieldReferencePage";
import InternalNotesPage from "@/pages/InternalNotesPage";
import CatToolPage from "@/pages/CatToolPage";
import NotFound from "./pages/NotFound";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { initSettings } from "@/stores/settings-init";
import { setUserTimezone } from "@/lib/format-timestamp";
import { installAiAgentBridge } from "@/lib/ai-agent-bridge";

function TranslatorFeeDetailWrapper() {
  const { id } = useParams();
  return <TranslatorFeeDetail key={id} />;
}

function CaseDetailPageWrapper() {
  const { id } = useParams();
  return <CaseDetailPage key={id} />;
}

function InvoiceDetailPageWrapper() {
  const { id } = useParams();
  return <InvoiceDetailPage key={id} />;
}

function ClientInvoiceDetailPageWrapper() {
  const { id } = useParams();
  return <ClientInvoiceDetailPage key={id} />;
}

function InternalNotesPageWrapper() {
  const { noteId } = useParams();
  return <InternalNotesPage key={noteId ?? "__list"} />;
}

function PageTemplateEditorPageWrapper() {
  const { id } = useParams();
  return <PageTemplateEditorPage key={id} />;
}

const queryClient = new QueryClient();

/** 非 PM/Executive 造訪 /settings 時顯示（不再靜默導向個人檔案，避免誤以為程式錯誤） */
function SettingsAccessDenied() {
  return (
    <div className="container max-w-lg py-10">
      <Alert>
        <AlertTitle>需要 PM 或 Executive 權限</AlertTitle>
        <AlertDescription className="mt-2 space-y-2 text-sm">
          <p>
            「設定」頁僅限帳號角色為 <strong>PM</strong> 或 <strong>Executive</strong>。Slack 連結已改至<strong>個人檔案</strong>（全員可用）。若你剛從連結開啟此頁，可能是因為目前帳號為一般成員。
          </p>
          <p>
            請由 Executive 在「權限管理」將你的角色設為 PM/Executive，或在 Supabase 的 <code className="rounded bg-muted px-1 text-xs">user_roles</code> 資料表為你的使用者新增{" "}
            <code className="rounded bg-muted px-1 text-xs">pm</code> 或 <code className="rounded bg-muted px-1 text-xs">executive</code>。
          </p>
          <p className="pt-2">
            <Link to="/profile" className="text-primary underline underline-offset-4">
              前往個人檔案
            </Link>
            <span className="text-muted-foreground"> · </span>
            <Link to="/cases" className="text-primary underline underline-offset-4">
              返回案件管理
            </Link>
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function SettingsRoute() {
  const { isAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) {
    return <SettingsAccessDenied />;
  }
  return <SettingsPage />;
}

/** 泛用「需要權限」提示（PM 以上／依模組權限）。 */
function ModuleAccessDenied({ label }: { label: string }) {
  return (
    <div className="container max-w-lg py-10">
      <Alert>
        <AlertTitle>沒有存取「{label}」的權限</AlertTitle>
        <AlertDescription className="mt-2 space-y-2 text-sm">
          <p>
            此頁僅限具對應權限的角色（一般為 <strong>PM</strong> 或 <strong>Executive</strong>）。若你以一般成員身分開啟此連結，會看到本提示。
          </p>
          <p className="pt-2">
            <Link to="/cases" className="text-primary underline underline-offset-4">
              返回案件管理
            </Link>
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function RouteGuardSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * 依 usePermissions().checkPerm 守衛路由，與 AppSidebar 選單顯示條件一致。
 * 補齊 URL 直達漏洞：側欄雖已隱藏，未守衛的路由仍可用網址進入。
 */
function RequireModule({
  moduleKey,
  itemKey,
  label,
  children,
}: {
  moduleKey: string;
  itemKey: string;
  label: string;
  children: ReactNode;
}) {
  const { loading: authLoading } = useAuth();
  const { checkPerm, loading: permLoading } = usePermissions();
  if (authLoading || permLoading) return <RouteGuardSpinner />;
  if (!checkPerm(moduleKey, itemKey, "view")) return <ModuleAccessDenied label={label} />;
  return <>{children}</>;
}

/** 僅執行長可進（權限管理）。 */
function RequireExecutive({ label, children }: { label: string; children: ReactNode }) {
  const { loading, roles } = useAuth();
  if (loading) return <RouteGuardSpinner />;
  const isExecutive = roles.some((r) => r.role === "executive");
  if (!isExecutive) return <ModuleAccessDenied label={label} />;
  return <>{children}</>;
}

function AuthenticatedRoutes() {
  const { user, loading, profile } = useAuth();

  // Sync user timezone for formatters
  useEffect(() => {
    setUserTimezone(profile?.timezone);
  }, [profile?.timezone]);

  useEffect(() => {
    if (!loading && user) {
      initSettings();
    }
  }, [loading, user]);

  useEffect(() => {
    installAiAgentBridge();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/cases" replace />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/cases/:id" element={<CaseDetailPageWrapper />} />
        <Route path="/fees" element={<TranslatorFees />} />
        <Route path="/fees/new" element={<NewTranslatorFee />} />
        <Route path="/fees/:id" element={<TranslatorFeeDetailWrapper />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPageWrapper />} />
        <Route
          path="/client-invoices"
          element={
            <RequireModule moduleKey="client_invoices" itemKey="cinv_list_view" label="客戶請款">
              <ClientInvoicesPage />
            </RequireModule>
          }
        />
        <Route
          path="/client-invoices/:id"
          element={
            <RequireModule moduleKey="client_invoices" itemKey="cinv_list_view" label="客戶請款">
              <ClientInvoiceDetailPageWrapper />
            </RequireModule>
          }
        />
        <Route
          path="/tools"
          element={
            <RequireModule moduleKey="tool_management" itemKey="tool_list_view" label="工具管理">
              <ToolManagementPage />
            </RequireModule>
          }
        />
        <Route
          path="/tools/page-template/:id"
          element={
            <RequireModule moduleKey="tool_management" itemKey="tool_list_view" label="工具管理">
              <PageTemplateEditorPageWrapper />
            </RequireModule>
          }
        />
        <Route
          path="/field-reference"
          element={
            <RequireModule moduleKey="field_reference" itemKey="field_ref_view" label="內部資料">
              <FieldReferencePage />
            </RequireModule>
          }
        />
        <Route
          path="/internal-notes/:noteId"
          element={
            <RequireModule moduleKey="internal_notes" itemKey="inotes_list_view" label="內部註記">
              <InternalNotesPageWrapper />
            </RequireModule>
          }
        />
        <Route
          path="/internal-notes"
          element={
            <RequireModule moduleKey="internal_notes" itemKey="inotes_list_view" label="內部註記">
              <InternalNotesPageWrapper />
            </RequireModule>
          }
        />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/members"
          element={
            <RequireModule moduleKey="team_members" itemKey="members_view" label="團隊成員">
              <MembersPage />
            </RequireModule>
          }
        />
        <Route
          path="/permissions"
          element={
            <RequireExecutive label="權限管理">
              <PermissionsPage />
            </RequireExecutive>
          }
        />
        <Route path="/cat/offline/*" element={<CatToolPage mode="offline" />} />
        <Route path="/cat/team/*" element={<CatToolPage mode="team" />} />
        {/* Legacy redirect: keep old /cat URL working */}
        <Route path="/cat" element={<Navigate to="/cat/offline" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <DeleteConfirmProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/*" element={<AuthenticatedRoutes />} />
          </Routes>
        </BrowserRouter>
      </DeleteConfirmProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
