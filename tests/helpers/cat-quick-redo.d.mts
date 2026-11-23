import type { Browser } from '@playwright/test';
type Snapshot = { rows: { id: string; text: string; status: string }[]; active?: string };
type Result = {
  failure?: string; redoComplete: boolean; focusCorrect: boolean; completeAfterReopen: boolean;
  reopened: Snapshot; errors: string[]; branch?: Snapshot; branchSavedWithoutBlur?: boolean;
  ordinary?: Snapshot; selected?: string; insertRedo?: Snapshot; insertReopened?: Snapshot;
};
export function runQuickRedoCase(browser: Browser,
  cfg: { scope: string; tailPause: number; prefixPause: number; extra?: boolean }, base: string, out: string): Promise<Result>;
