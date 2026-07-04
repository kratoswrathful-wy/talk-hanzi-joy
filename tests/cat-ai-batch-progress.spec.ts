import { test, expect } from "@playwright/test";
import { resolveCatFixture } from "./helpers/cat-fixtures";
import { openOfflineCatWithFile } from "./helpers/cat-offline-open";

/**
 * W9 wave 2 C2 回歸測試：__catAgent.aiBatch.getProgress()。
 *
 * 背景（2026-07-04 驗收退回修正）：_loadAiTaskLogs 原本只存在於 app.js 的
 * DOMContentLoaded 閉包內，未匯出到 window，導致 cat-agent-bridge.js 讀
 * global._loadAiTaskLogs 永遠 undefined，getProgress() 100% 回「不可用」。
 * 修正：app.js 於既有 window.xxx 匯出區塊補一行 window._loadAiTaskLogs。
 *
 * 本測試不觸發真實 LLM 呼叫（成本與不穩定），改用實際存在的 localStorage
 * task-log 結構（與 app.js `_startAiTaskLog`/`_updateAiTaskLog` 寫入格式
 * 一致）模擬一次批次翻譯的生命週期，驗證 getProgress() 讀取與欄位對應正確。
 */
const SMALL_FIXTURE = resolveCatFixture("small");

test.describe("CAT AI 批次進度查詢（getProgress）", () => {
  test("空閒狀態回 idle，不報「不可用」", async ({ page }) => {
    test.setTimeout(240_000);
    const frame = await openOfflineCatWithFile(page, {
      fixturePath: SMALL_FIXTURE,
      projectName: `[PW] getProgress-idle ${Date.now()}`,
    });

    const idle = await frame.locator("body").evaluate(() => {
      const agent = (window as unknown as {
        __catAgent: { aiBatch: { getProgress: () => { ok: boolean; error?: string; data?: { running?: boolean; status?: string } } } };
      }).__catAgent;
      return agent.aiBatch.getProgress();
    });
    expect(idle.ok, idle.error).toBe(true);
    expect(idle.data?.running).toBe(false);
    expect(idle.data?.status).toBe("idle");
  });

  test("模擬批次生命週期：running→success，欄位對應正確", async ({ page }) => {
    test.setTimeout(240_000);
    const frame = await openOfflineCatWithFile(page, {
      fixturePath: SMALL_FIXTURE,
      projectName: `[PW] getProgress-lifecycle ${Date.now()}`,
    });

    // 寫入一筆與 app.js _startAiTaskLog 相同結構的「執行中」紀錄
    await frame.locator("body").evaluate(() => {
      const entry = {
        id: "task_test_1",
        kind: "batch_translate",
        status: "running",
        startedAt: new Date().toISOString(),
        endedAt: null,
        projectId: "p1",
        fileId: "f1",
        projectLabel: "測試專案",
        fileLabel: "測試檔案",
        rangeLabel: "全文",
        progressLabel: "第 1/3 批",
        processed: 20,
        total: 60,
        batchNo: 1,
        batchTotalHint: 3,
        errorMessage: "",
      };
      localStorage.setItem("catAiTaskLogV1", JSON.stringify([entry]));
    });

    const running = await frame.locator("body").evaluate(() => {
      const agent = (window as unknown as {
        __catAgent: {
          aiBatch: {
            getProgress: () => {
              ok: boolean;
              error?: string;
              data?: {
                running?: boolean;
                batchDone?: number;
                batchTotal?: number;
                segDone?: number;
                segTotal?: number;
                phase?: string;
                lastError?: string | null;
                status?: string;
              };
            };
          };
        };
      }).__catAgent;
      return agent.aiBatch.getProgress();
    });
    expect(running.ok, running.error).toBe(true);
    expect(running.data).toMatchObject({
      running: true,
      batchDone: 1,
      batchTotal: 3,
      segDone: 20,
      segTotal: 60,
      phase: "第 1/3 批",
      lastError: null,
      status: "running",
    });

    // 更新為「已完成」，驗證 running 轉為 false 且 lastError 為 null
    await frame.locator("body").evaluate(() => {
      const raw = localStorage.getItem("catAiTaskLogV1");
      const logs = raw ? JSON.parse(raw) : [];
      logs[0].status = "success";
      logs[0].processed = 60;
      logs[0].batchNo = 3;
      logs[0].progressLabel = "已處理 60/60 句";
      logs[0].endedAt = new Date().toISOString();
      localStorage.setItem("catAiTaskLogV1", JSON.stringify(logs));
    });

    const finished = await frame.locator("body").evaluate(() => {
      const agent = (window as unknown as {
        __catAgent: {
          aiBatch: {
            getProgress: () => {
              ok: boolean;
              data?: { running?: boolean; batchDone?: number; segDone?: number; status?: string; lastError?: string | null };
            };
          };
        };
      }).__catAgent;
      return agent.aiBatch.getProgress();
    });
    expect(finished.data).toMatchObject({
      running: false,
      batchDone: 3,
      segDone: 60,
      status: "success",
      lastError: null,
    });

    // 失敗案例：lastError 應帶出錯誤訊息
    await frame.locator("body").evaluate(() => {
      const raw = localStorage.getItem("catAiTaskLogV1");
      const logs = raw ? JSON.parse(raw) : [];
      logs[0].status = "failed";
      logs[0].errorMessage = "翻譯失敗：模擬錯誤";
      localStorage.setItem("catAiTaskLogV1", JSON.stringify(logs));
    });

    const failed = await frame.locator("body").evaluate(() => {
      const agent = (window as unknown as {
        __catAgent: {
          aiBatch: {
            getProgress: () => {
              ok: boolean;
              data?: { running?: boolean; status?: string; lastError?: string | null };
            };
          };
        };
      }).__catAgent;
      return agent.aiBatch.getProgress();
    });
    expect(failed.data).toMatchObject({
      running: false,
      status: "failed",
      lastError: "翻譯失敗：模擬錯誤",
    });
  });
});
