import type { ClientInfo, FeeTaskItem } from "@/data/fee-mock-data";

export type FeeClientPriceLookup = (
  clientName: string,
  taskType: string,
  billingUnit: string,
) => number | undefined;

export type FeeTranslatorPriceLookup = (
  clientPrice: number,
  taskType: string,
  billingUnit: string,
) => number | undefined;

export type FeeClientSelectionPatch = {
  clientInfo: ClientInfo;
  taskItems: FeeTaskItem[];
  appliedDefaultRates: boolean;
};

/**
 * 使用者真的改選客戶時才套預設費率。
 * 內部回灌／相同客戶重播不得再套一次，以免清掉後續手填單價。
 */
export function shouldApplyClientDefaultRates(
  previousClient: string | undefined,
  nextClient: string | undefined,
): boolean {
  const prev = (previousClient ?? "").trim();
  const next = (nextClient ?? "").trim();
  return next.length > 0 && prev !== next;
}

/** 一次選客戶對應一次寫入意圖：客戶＋可選預設單價／稿費，不得拆成兩次 notify。 */
export function applyFeeClientSelection(input: {
  clientInfo: ClientInfo;
  taskItems: FeeTaskItem[];
  clientName: string;
  getClientPrice: FeeClientPriceLookup;
  getTranslatorPrice: FeeTranslatorPriceLookup;
}): FeeClientSelectionPatch {
  const applyRates = shouldApplyClientDefaultRates(input.clientInfo.client, input.clientName);
  const clientInfo: ClientInfo = {
    ...input.clientInfo,
    client: input.clientName,
    clientTaskItems: applyRates
      ? input.clientInfo.clientTaskItems.map((item) => {
          const price = input.getClientPrice(input.clientName, item.taskType, item.billingUnit);
          return price !== undefined ? { ...item, clientPrice: price } : item;
        })
      : input.clientInfo.clientTaskItems.map((item) => ({ ...item })),
  };
  const taskItems = applyRates
    ? input.taskItems.map((item) => {
        const cp = input.getClientPrice(input.clientName, item.taskType, item.billingUnit);
        if (cp === undefined) return item;
        const tp = input.getTranslatorPrice(cp, item.taskType, item.billingUnit);
        return tp !== undefined ? { ...item, unitPrice: tp } : item;
      })
    : input.taskItems.map((item) => ({ ...item }));
  return { clientInfo, taskItems, appliedDefaultRates: applyRates };
}
