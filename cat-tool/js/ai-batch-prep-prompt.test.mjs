import { describe, expect, it } from "vitest";
import {
  PREP_AFTER_AI_MESSAGE,
  PREP_AFTER_AI_OK_LABEL,
  PREP_AFTER_AI_CANCEL_LABEL,
  isSuccessfulAiBatchCompletion,
  decideAfterSuccessfulBatch,
  shouldSkipFirstEditPromptForAiBatch,
  resolvePrepConfirmApplyAction,
} from "./ai-batch-prep-prompt.js";

const baseOk = {
  jobStatus: "success",
  leftoverMissing: 0,
  saveFailed: 0,
  currentFileId: "file-a",
  jobFileId: "file-a",
  jobToken: 7,
  lastPromptedJobToken: null,
  prepActive: true,
  canConfirmPrep: true,
};

describe("批次成功才退出＋詢問", () => {
  it("正常完成且已保存 → 退出並詢問一次", () => {
    const d = decideAfterSuccessfulBatch(baseOk);
    expect(isSuccessfulAiBatchCompletion(baseOk)).toBe(true);
    expect(d.exitAiMode).toBe(true);
    expect(d.promptPrep).toBe(true);
  });

  it("已準備完成只退出、不再問、不覆蓋", () => {
    expect(decideAfterSuccessfulBatch({ ...baseOk, prepActive: false, alreadyPrepCompleted: true })).toEqual({
      exitAiMode: true,
      promptPrep: false,
      reason: "prep-already-done",
    });
  });

  it("取消、部分失敗、保存不明、重複回呼、切檔都不問", () => {
    expect(decideAfterSuccessfulBatch({ ...baseOk, cancelled: true }).promptPrep).toBe(false);
    expect(decideAfterSuccessfulBatch({ ...baseOk, leftoverMissing: 1 }).exitAiMode).toBe(false);
    expect(decideAfterSuccessfulBatch({ ...baseOk, saveFailed: 1 }).exitAiMode).toBe(false);
    expect(decideAfterSuccessfulBatch({ ...baseOk, saveUnknown: true }).exitAiMode).toBe(false);
    expect(decideAfterSuccessfulBatch({ ...baseOk, lastPromptedJobToken: 7 }).promptPrep).toBe(false);
    expect(decideAfterSuccessfulBatch({ ...baseOk, currentFileId: "file-b" }).exitAiMode).toBe(false);
  });
});

describe("首次編輯與確認套用", () => {
  it("同一批次套用期間跳過首次編輯詢問", () => {
    expect(shouldSkipFirstEditPromptForAiBatch({ batchRunning: true })).toBe(true);
    expect(shouldSkipFirstEditPromptForAiBatch({ suppressFirstEdit: true })).toBe(true);
    expect(shouldSkipFirstEditPromptForAiBatch({})).toBe(false);
  });

  it("暫不／關掉視窗不改準備；他人已完成不覆蓋", () => {
    expect(resolvePrepConfirmApplyAction({ confirmed: false, prepStatus: "active" })).toBe("skip-declined");
    expect(resolvePrepConfirmApplyAction({ confirmed: true, prepStatus: "completed" })).toBe("skip-already-done");
    expect(resolvePrepConfirmApplyAction({ confirmed: true, prepStatus: "active" })).toBe("apply");
  });

  it("提示含整檔基準說明與暫不", () => {
    expect(PREP_AFTER_AI_MESSAGE).toContain("整個檔案目前的譯文");
    expect(PREP_AFTER_AI_OK_LABEL).toBe("確認");
    expect(PREP_AFTER_AI_CANCEL_LABEL).toBe("暫不");
  });
});
