/**
 * 契約：fee／invoice／clientInvoice 的 get（同步）與 getFresh（非同步）。
 * 防止再把 get 改成 Promise 造成舊腳本同步讀到 undefined。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TranslatorFee } from "@/data/fee-mock-data";
import type { Invoice } from "@/data/invoice-types";
import type { ClientInvoice } from "@/data/client-invoice-types";

const feeById = new Map<string, TranslatorFee>();
const invoiceById = new Map<string, Invoice>();
const clientInvoiceById = new Map<string, ClientInvoice>();

const loadFeesMock = vi.fn(async () => {
  /* no-op; tests seed maps directly */
});
const fetchFeeByIdMock = vi.fn(async (id: string) => feeById.get(id) ?? null);
const ensureInvoiceLoadedMock = vi.fn(async () => undefined);
const fetchInvoiceByIdMock = vi.fn(async (id: string) => invoiceById.get(id) ?? null);
const ensureClientInvoiceLoadedMock = vi.fn(async () => undefined);
const fetchClientInvoiceByIdMock = vi.fn(async (id: string) => clientInvoiceById.get(id) ?? null);

vi.mock("@/stores/fee-store", () => ({
  feeStore: {
    getFees: () => [...feeById.values()],
    getFeeById: (id: string) => feeById.get(id),
    isLoaded: () => true,
    loadFees: (...args: unknown[]) => loadFeesMock(...args),
    fetchFeeById: (id: string) => fetchFeeByIdMock(id),
    createDraft: vi.fn(),
    updateFee: vi.fn(),
  },
}));

vi.mock("@/stores/invoice-store", () => ({
  invoiceStore: {
    getInvoices: () => [...invoiceById.values()],
    getInvoiceById: (id: string) => invoiceById.get(id),
    ensureLoaded: (...args: unknown[]) => ensureInvoiceLoadedMock(...args),
    fetchInvoiceById: (id: string) => fetchInvoiceByIdMock(id),
  },
}));

vi.mock("@/stores/client-invoice-store", () => ({
  clientInvoiceStore: {
    getInvoices: () => [...clientInvoiceById.values()],
    getInvoiceById: (id: string) => clientInvoiceById.get(id),
    ensureLoaded: (...args: unknown[]) => ensureClientInvoiceLoadedMock(...args),
    fetchInvoiceById: (id: string) => fetchClientInvoiceByIdMock(id),
  },
}));

vi.mock("@/stores/case-store", () => ({
  caseStore: {
    getCases: () => [],
    getCaseById: () => undefined,
  },
}));

vi.mock("@/stores/select-options-store", () => ({
  selectOptionsStore: {
    getSortedOptions: () => [],
  },
}));

vi.mock("@/lib/generate-case-fees", () => ({
  generateFeesForCase: vi.fn(),
}));

vi.mock("@/lib/ai-agent-upload", () => ({
  uploadFromBytes: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  },
}));

const { buildLmsAgentApi } = await import("./ai-agent-bridge");

function seedFee(id: string, title = "fee-title"): TranslatorFee {
  const fee = {
    id,
    title,
    assignee: "",
    status: "draft",
    internalNote: "",
    taskItems: [],
    notes: [],
    editLogs: [],
    createdBy: "",
    createdAt: new Date().toISOString(),
  } as TranslatorFee;
  feeById.set(id, fee);
  return fee;
}

function seedInvoice(id: string, title = "inv-title"): Invoice {
  const inv = {
    id,
    title,
    translator: "譯者甲",
    status: "draft",
    feeIds: [],
    createdAt: new Date().toISOString(),
  } as Invoice;
  invoiceById.set(id, inv);
  return inv;
}

function seedClientInvoice(id: string, title = "cinv-title"): ClientInvoice {
  const inv = {
    id,
    title,
    client: "CCJK",
    status: "draft",
    feeIds: [],
    createdAt: new Date().toISOString(),
  } as ClientInvoice;
  clientInvoiceById.set(id, inv);
  return inv;
}

describe("LMS agent get／getFresh 契約", () => {
  beforeEach(() => {
    feeById.clear();
    invoiceById.clear();
    clientInvoiceById.clear();
    loadFeesMock.mockClear();
    fetchFeeByIdMock.mockClear();
    ensureInvoiceLoadedMock.mockClear();
    fetchInvoiceByIdMock.mockClear();
    ensureClientInvoiceLoadedMock.mockClear();
    fetchClientInvoiceByIdMock.mockClear();
  });

  it("舊式同步讀取：agent.fee.get(id).ok 可不 await", () => {
    seedFee("fee-1", "同步費用");
    const agent = buildLmsAgentApi();
    const got = agent.fee.get("fee-1");
    expect(got).not.toBeInstanceOf(Promise);
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.data.title).toBe("同步費用");
  });

  it("invoice／clientInvoice.get 亦為同步 AgentResult", () => {
    seedInvoice("inv-1");
    seedClientInvoice("cinv-1");
    const agent = buildLmsAgentApi();
    const inv = agent.invoice.get("inv-1");
    const cinv = agent.clientInvoice.get("cinv-1");
    expect(inv).not.toBeInstanceOf(Promise);
    expect(cinv).not.toBeInstanceOf(Promise);
    expect(inv.ok && inv.data.id).toBe("inv-1");
    expect(cinv.ok && cinv.data.id).toBe("cinv-1");
  });

  it("await fee.getFresh：本地缺列時 ensureLoaded＋單筆 fetch", async () => {
    const agent = buildLmsAgentApi();
    // 模擬「整表已 loaded 但缺此列」→ getFresh 走單筆 fetch
    fetchFeeByIdMock.mockImplementation(async (id: string) => {
      const fee = seedFee(id, "補抓費用");
      return fee;
    });
    const got = await agent.fee.getFresh("fee-missing");
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.data.title).toBe("補抓費用");
    expect(fetchFeeByIdMock).toHaveBeenCalledWith("fee-missing");
  });

  it("await invoice.getFresh／clientInvoice.getFresh：本地缺列時補抓", async () => {
    const agent = buildLmsAgentApi();
    fetchInvoiceByIdMock.mockImplementation(async (id: string) => seedInvoice(id, "補抓譯者請款"));
    fetchClientInvoiceByIdMock.mockImplementation(async (id: string) =>
      seedClientInvoice(id, "補抓客戶請款"),
    );

    const inv = await agent.invoice.getFresh("inv-missing");
    const cinv = await agent.clientInvoice.getFresh("cinv-missing");
    expect(inv.ok && inv.data.title).toBe("補抓譯者請款");
    expect(cinv.ok && cinv.data.title).toBe("補抓客戶請款");
    expect(ensureInvoiceLoadedMock).toHaveBeenCalled();
    expect(ensureClientInvoiceLoadedMock).toHaveBeenCalled();
  });

  it("getFresh 本地已有列時不觸發 fetch", async () => {
    seedFee("fee-local", "本地已有");
    const agent = buildLmsAgentApi();
    const got = await agent.fee.getFresh("fee-local");
    expect(got.ok && got.data.title).toBe("本地已有");
    expect(fetchFeeByIdMock).not.toHaveBeenCalled();
  });

  it("describe() 標明 get 同步與 getFresh 非同步", () => {
    const agent = buildLmsAgentApi();
    const d = agent.describe();
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const usage = d.data.usage as string[];
    expect(usage.some((u) => u.includes("getFresh") && u.includes("await"))).toBe(true);
    expect(d.data.fee.readMethods.get).toMatch(/同步/);
    expect(d.data.fee.readMethods.getFresh).toMatch(/非同步|await/);
  });
});
