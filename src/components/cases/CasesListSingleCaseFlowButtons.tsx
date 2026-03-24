import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { UiToolbarButtonIcon } from "@/lib/ui-button-icon-render";
import { useToolbarButtonUiProps, useUiButtonLabel } from "@/stores/ui-button-style-store";
import type { CaseRecord } from "@/data/case-types";

export type CasesListFlowProfile = {
  display_name?: string | null;
  email?: string | null;
  slack_message_defaults?: unknown;
} | null;

/**
 * 案件總表「選取一筆」時的流程按鈕；順序與邏輯與案件個別頁頂部一致（不含「新增案件」）。
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
  const uiDecline = useToolbarButtonUiProps("cases_detail_decline");
  const uiRevertToDraft = useToolbarButtonUiProps("cases_detail_revert_to_draft");
  const uiCancelDispatch = useToolbarButtonUiProps("cases_detail_cancel_dispatch");
  const uiRevertRevision = useToolbarButtonUiProps("cases_detail_revert_revision");
  const uiRevertToFeedback = useToolbarButtonUiProps("cases_detail_revert_to_feedback");
  const uiDeleteDraft = useToolbarButtonUiProps("cases_detail_delete_draft");
  const uiPublish = useToolbarButtonUiProps("cases_detail_publish");
  const uiAcceptCase = useToolbarButtonUiProps("cases_detail_accept_case");
  const uiFinalizeAssign = useToolbarButtonUiProps("cases_detail_finalize_assign");
  const uiTaskComplete = useToolbarButtonUiProps("cases_detail_task_complete");
  const uiFeedbackDone = useToolbarButtonUiProps("cases_detail_feedback_done");
  const uiMarkDeliveredDetail = useToolbarButtonUiProps("cases_mark_delivered");
  const uiFeedbackOpen = useToolbarButtonUiProps("cases_detail_feedback_open");

  const lbDecline = useUiButtonLabel("cases_detail_decline") ?? "無法承接";
  const lbRevertToDraft = useUiButtonLabel("cases_detail_revert_to_draft") ?? "收回為草稿";
  const lbCancelDispatch = useUiButtonLabel("cases_detail_cancel_dispatch") ?? "取消指派";
  const lbRevertRevision = useUiButtonLabel("cases_detail_revert_revision") ?? "退回修正";
  const lbRevertToFeedback = useUiButtonLabel("cases_detail_revert_to_feedback") ?? "退回處理";
  const lbDeleteDraft = useUiButtonLabel("cases_detail_delete_draft") ?? "刪除";
  const lbPublish = useUiButtonLabel("cases_detail_publish") ?? "公布";
  const lbAcceptCase = useUiButtonLabel("cases_detail_accept_case") ?? "承接本案";
  const lbFinalizeAssign = useUiButtonLabel("cases_detail_finalize_assign") ?? "確定指派";
  const lbTaskComplete = useUiButtonLabel("cases_detail_task_complete") ?? "任務完成";
  const lbFeedbackDone = useUiButtonLabel("cases_detail_feedback_done") ?? "處理完畢";
  const lbMarkDelivered = useUiButtonLabel("cases_mark_delivered") ?? "交件完畢";
  const lbFeedbackOpen = useUiButtonLabel("cases_detail_feedback_open") ?? "處理回饋";

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
        <Button size="sm" className={uiDecline.className} style={uiDecline.style} onClick={onOpenDecline}>
          {lbDecline}
        </Button>
      )}
      {isInquiry && isPmOrAbove ? (
        <Button size="sm" className={uiRevertToDraft.className} style={uiRevertToDraft.style} onClick={onRevertToDraft}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_revert_to_draft" />
          {lbRevertToDraft}
        </Button>
      ) : isDispatched && isPmOrAbove ? (
        <Button size="sm" className={uiCancelDispatch.className} style={uiCancelDispatch.style} onClick={onCancelDispatch}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_cancel_dispatch" />
          {lbCancelDispatch}
        </Button>
      ) : (isDelivered || isFeedback) && isPmOrAbove ? (
        <Button size="sm" className={uiRevertRevision.className} style={uiRevertRevision.style} onClick={onRevertRevision}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_revert_revision" />
          {lbRevertRevision}
        </Button>
      ) : isTaskCompleted && isPmOrAbove ? (
        <Button size="sm" className={uiRevertRevision.className} style={uiRevertRevision.style} onClick={onRevertRevision}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_revert_revision" />
          {lbRevertRevision}
        </Button>
      ) : isFeedbackCompleted && isPmOrAbove ? (
        <Button size="sm" className={uiRevertToFeedback.className} style={uiRevertToFeedback.style} onClick={onRevertToFeedback}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_revert_to_feedback" />
          {lbRevertToFeedback}
        </Button>
      ) : isDraft && isPmOrAbove ? (
        <Button size="sm" className={uiDeleteDraft.className} style={uiDeleteDraft.style} onClick={onOpenDeleteDraft}>
          <UiToolbarButtonIcon uiButtonId="cases_detail_delete_draft" />
          {lbDeleteDraft}
        </Button>
      ) : null}
      {isDraft && isPmOrAbove ? (
        <Button size="sm" className={uiPublish.className} style={uiPublish.style} onClick={onPublish}>
          {lbPublish}
        </Button>
      ) : isInquiry && isMember ? (
        (() => {
          const currentTranslators = caseData.translator || [];
          const hasOtherTranslator =
            currentTranslators.length > 0 && !currentTranslators.includes(profile?.display_name || "");
          if (caseData.multiCollab) {
            return (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" className={cn(uiAcceptCase.className, "opacity-60")} style={uiAcceptCase.style} disabled>
                        {lbAcceptCase}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>請於表格內可承接的橫列勾選「確認承接」</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }
          if (hasOtherTranslator) {
            return (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" className={cn(uiAcceptCase.className, "opacity-60")} style={uiAcceptCase.style} disabled>
                        {lbAcceptCase}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>本案可能正洽詢其他譯者，如欲承接請洽派案人員</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }
          return (
            <Button size="sm" className={uiAcceptCase.className} style={uiAcceptCase.style} onClick={onAcceptCase}>
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
              className={uiFinalizeAssign.className}
              style={uiFinalizeAssign.style}
              disabled={translatorEmpty}
              onClick={onFinalizeAssign}
            >
              {lbFinalizeAssign}
            </Button>
          );
          return translatorEmpty ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{btn}</span>
                </TooltipTrigger>
                <TooltipContent>譯者欄不得空白</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            btn
          );
        })()
      ) : isDispatched && (isCurrentUserTranslator || isPmOrAbove) ? (
        caseData.multiCollab ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" className={cn(uiTaskComplete.className, "opacity-60")} style={uiTaskComplete.style} disabled>
                    <CheckSquare className="h-4 w-4 shrink-0" />
                    {lbTaskComplete}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>請直接勾選「任務完成」</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button size="sm" className={uiTaskComplete.className} style={uiTaskComplete.style} onClick={onTaskComplete}>
            <UiToolbarButtonIcon uiButtonId="cases_detail_task_complete" />
            {lbTaskComplete}
          </Button>
        )
      ) : isFeedback && (isCurrentUserTranslator || isPmOrAbove) ? (
        <Button size="sm" className={uiFeedbackDone.className} style={uiFeedbackDone.style} onClick={onFeedbackComplete}>
          {lbFeedbackDone}
        </Button>
      ) : (isTaskCompleted || isFeedbackCompleted) && isPmOrAbove ? (
        <Button size="sm" className={uiMarkDeliveredDetail.className} style={uiMarkDeliveredDetail.style} onClick={onMarkDelivered}>
          <UiToolbarButtonIcon uiButtonId="cases_mark_delivered" />
          {lbMarkDelivered}
        </Button>
      ) : isDelivered && isPmOrAbove ? (
        <Button size="sm" className={uiFeedbackOpen.className} style={uiFeedbackOpen.style} onClick={onFeedbackOpen}>
          {lbFeedbackOpen}
        </Button>
      ) : null}
    </>
  );
}
