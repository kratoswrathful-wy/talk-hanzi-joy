import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function pageSource(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function updaterContainsPersist(src: string, setter: string, persist: string) {
  const re = new RegExp(`${setter}\\(\\s*\\(prev\\) => \\{[\\s\\S]{0,500}?${persist}`, "m");
  return re.test(src);
}

describe("財務明細 state updater 不得直接 persist", () => {
  it("費用明細：setTaskItems／setEditLog／setClientInfo 內不再呼叫 updateFee", () => {
    const src = pageSource("src/pages/TranslatorFeeDetail.tsx");
    expect(updaterContainsPersist(src, "setTaskItems", "feeStore.updateFee")).toBe(false);
    expect(updaterContainsPersist(src, "setEditLog", "feeStore.updateFee")).toBe(false);
    expect(updaterContainsPersist(src, "setClientInfo", "feeStore.updateFee")).toBe(false);
  });

  it("兩種請款明細：setEditLog 內不再呼叫 updateInvoice", () => {
    const translator = pageSource("src/pages/InvoiceDetailPage.tsx");
    const client = pageSource("src/pages/ClientInvoiceDetailPage.tsx");
    expect(updaterContainsPersist(translator, "setEditLog", "invoiceStore.updateInvoice")).toBe(false);
    expect(updaterContainsPersist(client, "setEditLog", "clientInvoiceStore.updateInvoice")).toBe(false);
  });
});
