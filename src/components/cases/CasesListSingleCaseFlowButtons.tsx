import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { UiToolbarButtonIcon } from "@/lib/ui-button-icon-render";
import { useCasesListFlowDetailToolbarUi } from "@/stores/ui-button-style-store";
import type { CaseRecord } from "@/data/case-types";

export type CasesListFlowProfile = {
  display_name?: string | null;
  email?: string | null;
  slack_message_defaults?: unknown;
} | null;

/**
 * 案件總表「選取一筆」時的流程按鈕；順序與邏輯與案件個別頁頂部一致（不含「新增案件」）。
 * App 根層已有 TooltipProvider，此處勿再巢狀包 TooltipProvider。
 */
export function CasesListSingleCaseFlowButtons({
  caseData,
  profile,
  isPmOrAbove,
  isTranslatorRole,
  onOpenDecline,
  onRevertToDraft,
  onCancelDispatch,
  onRevertRevision,
  onRevertToFeedback,
  onOpenDeleteDraft,
  onPublish,
  onAcceptCase,
  onFinalizeAssign,
  onTaskComplete,
  onFeedbackComplete,
  onMarkDelivered,
  onFeedbackOpen,
}: {
  caseData: CaseRecord;
  profile: CasesListFlowProfile;
  isPmOrAbove: boolean;
  /** primaryRole === "member" */
  isTranslatorRole: boolean;
  onOpenDecline: () => void;
  onRevertToDraft: () => void;
  onCancelDispatch: () => void;
  onRevertRevision: () => void;
  onRevertToFeedback: () => void;
  onOpenDeleteDraft: () => void;
  onPublish: () => void;
  onAcceptCase: () => void;
  onFinalizeAssign: () => void;
  onTaskComplete: () => void;
  onFeedbackComplete: () => void;
  onMarkDelivered: () => void;
  onFeedbackOpen: () => void;
}) {
  const { propsById: ui, labelById: lb } = useCasesListFlowDetailToolbarUi();

  const lbDecline = lb["cases_detail_decline"] || "無法承接";
  const lbRevertToDraft = lb["cases_detail_revert_to_draft"] || "收回為草稿";
  const lbCancelDispatch = lb["cases_detail_cancel_dispatch"] || "取消指派";
  const lbRevertRevision = lb["cases_detail_revert_revision"] || "退回修正";
  const lbRevertToFeedback = lb["cases_detail_revert_to_feedback"] || "退回處理";
  const lbDeleteDraft = lb["cases_detail_delete_draft"] || "刪除";
  const lbPublish = lb["cases_detail_publish"] || "公布";
  const lbAcceptCase = lb["cases_detail_accept_case"] || "承接本案";
  const lbFinalizeAssign = lb["cases_detail_finalize_assign"] || "確定指派";
  const lbTaskComplete = lb["cases_detail_task_complete"] || "任務完成";
  const lbFeedbackDone = lb["cases_detail_feedback_done"] || "處理完畢";
  const lbMarkDelivered = lb["cases_mark_delivered"] || "交件完畢";
  const lbFeedbackOpen = lb["cases_detail_feedback_open"] || "處理回饋";

  const isDraft = caseData.status === "draft";
  const isInquiry = caseData.status === "inquiry";
  const isDispatched = caseData.status === "dispatched";
  const isTaskCompleted = caseData.status === "task_completed";
  const isDelivered = caseData.status === "delivered";
  const isFeedback = caseData.status === "feedback";
  const isFeedbackCompleted = caseData.status === "feedback_completed";

  const isMember = isTranslatorRole;

  const isCurrentUserTranslator = (() => {
    const dn = profile?.display_name || "";
    if (!dn) return false;
    if ((caseData.translator || []).includes(dn)) return true;
    if (caseData.multiCollab && caseData.collabRows?.some((r) => r.translator === dn)) return true;
    return false;
  })();

  return (
    <>
      {(isDraft || isInquiry) && isMember && (
        <Button size="sm" className={ui["cases_detail_decline"].className} style={ui["cases_detail_decline"].style} onClick={onOpenDecline}>
          {lbDecline}
        </Button>
      )}
      {isInquiry && isPmOrAbove ? (
        <Button size="sm" className={ui["cases_detail_revert_to_draft"].className} style={ui["cases_detail_revert_to_draft"].style} onClick={onRevertToDraft}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_revert_to_draft" />
          {lbRevertToDraft}
        </Button>
      ) : isDispatched && isPmOrAbove ? (
        <Button size="sm" className={ui["cases_detail_cancel_dispatch"].className} style={ui["cases_detail_cancel_dispatch"].style} onClick={onCancelDispatch}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_cancel_dispatch" />
          {lbCancelDispatch}
        </Button>
      ) : (isDelivered || isFeedback) && isPmOrAbove ? (
        <Button size="sm" className={ui["cases_detail_revert_revision"].className} style={ui["cases_detail_revert_revision"].style} onClick={onRevertRevision}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_revert_revision" />
          {lbRevertRevision}
        </Button>
      ) : isTaskCompleted && isPmOrAbove ? (
        <Button size="sm" className={ui["cases_detail_revert_revision"].className} style={ui["cases_detail_revert_revision"].style} onClick={onRevertRevision}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_revert_revision" />
          {lbRevertRevision}
        </Button>
      ) : isFeedbackCompleted && isPmOrAbove ? (
        <Button size="sm" className={ui["cases_detail_revert_to_feedback"].className} style={ui["cases_detail_revert_to_feedback"].style} onClick={onRevertToFeedback}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_revert_to_feedback" />
          {lbRevertToFeedback}
        </Button>
      ) : isDraft && isPmOrAbove ? (
        <Button size="sm" className={ui["cases_detail_delete_draft"].className} style={ui["cases_detail_delete_draft"].style} onClick={onOpenDeleteDraft}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_delete_draft" />
          {lbDeleteDraft}
        </Button>
      ) : null}
      {isDraft && isPmOrAbove ? (
        <Button size="sm" className={ui["cases_detail_publish"].className} style={ui["cases_detail_publish"].style} onClick={onPublish}>
          {lbPublish}
        </Button>
      ) : isInquiry && isMember ? (
        (() => {
          const currentTranslators = caseData.translator || [];
          const hasOtherTranslator =
            currentTranslators.length > 0 && !currentTranslators.includes(profile?.display_name || "");
          if (caseData.multiCollab) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" className={cn(ui["cases_detail_accept_case"].className, "opacity-60")} style={ui["cases_detail_accept_case"].style} disabled>
                      {lbAcceptCase}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>請於表格內可承接的橫列勾選「確認承接」</TooltipContent>
              </Tooltip>
            );
          }
          if (hasOtherTranslator) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" className={cn(ui["cases_detail_accept_case"].className, "opacity-60")} style={ui["cases_detail_accept_case"].style} disabled>
                      {lbAcceptCase}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>本案可能正洽詢其他譯者，如欲承接請洽派案人員</TooltipContent>
              </Tooltip>
            );
          }
          return (
            <Button size="sm" className={ui["cases_detail_accept_case"].className} style={ui["cases_detail_accept_case"].style} onClick={onAcceptCase}>
              {lbAcceptCase}
            </Button>
          );
        })()
      ) : isInquiry && isPmOrAbove ? (
        (() => {
          const translatorEmpty = !caseData.translator || caseData.translator.length === 0;
          const btn = (
            <Button
              size="sm"
              className={ui["cases_detail_finalize_assign"].className}
              style={ui["cases_detail_finalize_assign"].style}
              disabled={translatorEmpty}
              onClick={onFinalizeAssign}
            >
              {lbFinalizeAssign}
            </Button>
          );
          return translatorEmpty ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{btn}</span>
              </TooltipTrigger>
              <TooltipContent>譯者欄不得空白</TooltipContent>
            </Tooltip>
          ) : (
            btn
          );
        })()
      ) : isDispatched && (isCurrentUserTranslator || isPmOrAbove) ? (
        caseData.multiCollab ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" className={cn(ui["cases_detail_task_complete"].className, "opacity-60")} style={ui["cases_detail_task_complete"].style} disabled>
                  <CheckSquare className="h-4 w-4 shrink-0" />
                  {lbTaskComplete}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>請直接勾選「任務完成」</TooltipContent>
          </Tooltip>
        ) : (
          <Button size="sm" className={ui["cases_detail_task_complete"].className} style={ui["cases_detail_task_complete"].style} onClick={onTaskComplete}>
            <UiToolbarButtonIcon uiButtonId="cases_detail_task_complete" />
            {lbTaskComplete}
          </Button>
        )
      ) : isFeedback && (isCurrentUserTranslator || isPmOrAbove) ? (
        <Button size="sm" className={ui["cases_detail_feedback_done"].className} style={ui["cases_detail_feedback_done"].style} onClick={onFeedbackComplete}>
          {lbFeedbackDone}
        </Button>
      ) : (isTaskCompleted || isFeedbackCompleted) && isPmOrAbove ? (
        <Button size="sm" className={ui["cases_mark_delivered"].className} style={ui["cases_mark_delivered"].style} onClick={onMarkDelivered}>
          <UiToolbarButtonIcon uiButtonId="cases_mark_delivered" />
          {lbMarkDelivered}
        </Button>
      ) : isDelivered && isPmOrAbove ? (
        <Button size="sm" className={ui["cases_detail_feedback_open"].className} style={ui["cases_detail_feedback_open"].style} onClick={onFeedbackOpen}>
          {lbFeedbackOpen}
        </Button>
      ) : null}
    </>
  );
}
