import { useEffect, useRef } from "react";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import type { CaseCreateNotice } from "@/lib/case-create-outcome";

/**
 * 建案成功且有「本次未帶入」時，等詳情案件已載入再顯示提醒，
 * 然後清掉 history state，避免重整重播。
 */
export function useCreatedCaseNotice(input: {
  caseId: string | undefined;
  loadedCaseId: string | undefined;
  createNotice: CaseCreateNotice | undefined;
  autoFocusTitle?: boolean;
  duplicateExpectedTitle?: string;
  navigate: NavigateFunction;
}): void {
  const {
    caseId,
    loadedCaseId,
    createNotice,
    autoFocusTitle,
    duplicateExpectedTitle,
    navigate,
  } = input;
  const shownCreateNoticeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!createNotice || !loadedCaseId || loadedCaseId !== caseId) return;
    const noticeKey = `${caseId}:${createNotice.title}:${createNotice.description}`;
    if (shownCreateNoticeKeyRef.current === noticeKey) return;
    shownCreateNoticeKeyRef.current = noticeKey;
    toast({
      title: createNotice.title,
      description: createNotice.description,
      duration: createNotice.durationMs,
    });
    navigate(".", {
      replace: true,
      state: {
        autoFocusTitle,
        duplicateExpectedTitle,
      },
    });
  }, [caseId, loadedCaseId, createNotice, autoFocusTitle, duplicateExpectedTitle, navigate]);
}
