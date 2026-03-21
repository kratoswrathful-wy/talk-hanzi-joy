import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeleteConfirmProvider } from "@/hooks/use-delete-confirm";
import { BrowserRouter, Routes, Route, Navigate, useParams, Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
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
import NotFound from "./pages/NotFound";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { initSettings } from "@/stores/settings-init";
import { setUserTimezone } from "@/lib/format-timestamp";

function TranslatorFeeDetailWrapper() {
  const { id } = useParams();
  return <TranslatorFeeDetail key={id} />;
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
            「設定」頁（含 Slack 連結）僅限帳號角色為 <strong>PM</strong> 或 <strong>Executive</strong>。若你剛從連結開啟此頁，可能是因為目前帳號為一般成員。
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
            <Link to="/fees" className="text-primary underline underline-offset-4">
              返回費用管理
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
        <Route path="/" element={<Navigate to="/fees" replace />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/cases/:id" element={<CaseDetailPage />} />
        <Route path="/fees" element={<TranslatorFees />} />
        <Route path="/fees/new" element={<NewTranslatorFee />} />
        <Route path="/fees/:id" element={<TranslatorFeeDetailWrapper />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/client-invoices" element={<ClientInvoicesPage />} />
        <Route path="/client-invoices/:id" element={<ClientInvoiceDetailPage />} />
        <Route path="/tools" element={<ToolManagementPage />} />
        <Route path="/tools/page-template/:id" element={<PageTemplateEditorPage />} />
        <Route path="/field-reference" element={<FieldReferencePage />} />
        <Route path="/internal-notes/:noteId" element={<InternalNotesPage />} />
        <Route path="/internal-notes" element={<InternalNotesPage />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/permissions" element={<PermissionsPage />} />
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
