import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { StatusStyleSection } from "@/components/settings/StatusStyleSection";
import { NoteSelectSection } from "@/components/settings/NoteSelectSection";
import { BillingChannelSection } from "@/components/settings/BillingChannelSection";
import { CaseCategorySection } from "@/components/settings/CaseCategorySection";
import { CurrencySettingsSection } from "@/components/settings/CurrencySettingsSection";
import { ToolbarButtonStyleSection } from "@/components/settings/ToolbarButtonStyleSection";
import { TaskTypeOrderSection } from "@/components/settings/TaskTypeOrderSection";
import { BillingUnitOrderSection } from "@/components/settings/BillingUnitOrderSection";
import { ClientPricingSection } from "@/components/settings/ClientPricingSection";
import { DispatchRouteSection } from "@/components/settings/DispatchRouteSection";
import { IconLibrarySection } from "@/components/settings/IconLibrarySection";
import { TranslatorTierSection } from "@/components/settings/TranslatorTierSection";
import { OpsIncidentsSection } from "@/components/settings/OpsIncidentsSection";

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const { canViewSection } = usePermissions();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理應用程式偏好設定</p>
      </div>

      {/* Row 1: 任務類型 (left) — 內容性質 (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {canViewSection("task_type_order") && <TaskTypeOrderSection />}
        <CaseCategorySection />
      </div>

      {/* Row 2: 計費單位 (left) — 派案來源 (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {canViewSection("task_type_order") && <BillingUnitOrderSection />}
        <DispatchRouteSection />
      </div>

      {/* Row 3: 客戶設定 (left) — 狀態標籤 (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {canViewSection("client_pricing") && <ClientPricingSection />}
        <StatusStyleSection />
      </div>

      <ToolbarButtonStyleSection />

      {/* Row 4: 貨幣設定 (left) — 圖示庫 (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {canViewSection("client_pricing") && <CurrencySettingsSection />}
        <IconLibrarySection />
      </div>

      {/* Row 5: 內部註記狀態 (left) — 內部註記性質 (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <NoteSelectSection fieldKey="noteStatus" title="內部註記狀態" addLabel="新增狀態" />
        <NoteSelectSection fieldKey="noteNature" title="內部註記性質" addLabel="新增性質" />
      </div>

      {/* Row 6: 請款管道 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BillingChannelSection />
      </div>

      {canViewSection("translator_tiers") && <TranslatorTierSection />}

      {isAdmin && <OpsIncidentsSection />}
    </div>
  );
}
