/**
 * Shared logic to generate fee records from a case.
 * Extracted from CaseDetailPage for reuse in bulk actions.
 */
import { feeStore } from "@/stores/fee-store";
import { selectOptionsStore, PRESET_COLORS, CONTACT_DEFAULT_COLOR } from "@/stores/select-options-store";
import { defaultPricingStore } from "@/stores/default-pricing-store";
import { type TranslatorFee, type FeeTaskItem, type TaskType, type BillingUnit, defaultClientInfo } from "@/data/fee-mock-data";
import type { CaseRecord } from "@/data/case-types";

const knownTaskTypes: TaskType[] = ["翻譯", "校對", "MTPE", "LQA"];
const taskTypeAliases: Record<string, TaskType> = { "審稿": "校對", "Review": "校對", "Translation": "翻譯", "Proofreading": "校對" };
const billingUnitMap: Record<string, BillingUnit> = { "字": "字", "小時": "小時" };

function matchTaskType(wt: string): string {
  const direct = knownTaskTypes.find((t) => wt.includes(t));
  if (direct) return direct;
  for (const [alias, mapped] of Object.entries(taskTypeAliases)) {
    if (wt.includes(alias)) return mapped;
  }
  return wt;
}

function ensureTaskTypeOption(taskType: string) {
  const existingOptions = selectOptionsStore.getSortedOptions("taskType");
  if (!existingOptions.find((o) => o.label === taskType)) {
    const color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
    selectOptionsStore.addOption("taskType", taskType, color);
  }
}

function ensureClientContactOptions(client: string, contact: string) {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  if (client) {
    const existing = selectOptionsStore.getSortedOptions("client");
    if (!existing.find((o) => normalize(o.label) === normalize(client))) {
      selectOptionsStore.addOption("client", client, PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
    }
  }
  if (contact) {
    const existing = selectOptionsStore.getSortedOptions("contact");
    if (!existing.find((o) => normalize(o.label) === normalize(contact))) {
      selectOptionsStore.addOption("contact", contact, CONTACT_DEFAULT_COLOR);
    }
  }
}

export interface GenerateFeeResult {
  caseTitle: string;
  caseId: string;
  feeIds: string[];
  feeCount: number;
}

/**
 * Generate fee records for a single case.
 * Returns the generated fee IDs, or null if no fees were generated.
 */
export function generateFeesForCase(
  caseData: CaseRecord,
  createdByUserId: string,
): GenerateFeeResult {
  const caseUrl = `${window.location.origin}/cases/${caseData.id}`;
  const rawGroups = Array.isArray(caseData.workGroups) ? caseData.workGroups : [];
  const workGroups = rawGroups.length > 0
    ? rawGroups
    : [{ id: `wg-fallback`, workType: "", billingUnit: caseData.billingUnit || "字", unitCount: caseData.unitCount || 0 }];
  const caseTitle = caseData.title || "";
  const caseClient = caseData.client || "";
  const caseContact = caseData.contact || "";
  const translators: string[] = Array.isArray(caseData.translator) ? caseData.translator : [];

  ensureClientContactOptions(caseClient, caseContact);

  const mapped: FeeTaskItem[] = workGroups.map((g, idx) => {
    const matchedType = matchTaskType((g.workType || "").trim() || "翻譯");
    ensureTaskTypeOption(matchedType);
    const bu = billingUnitMap[g.billingUnit] || "字";
    const clientPrice = caseClient
      ? defaultPricingStore.getClientPrice(caseClient, matchedType, bu) ?? 0
      : 0;
    const translatorPrice = clientPrice > 0
      ? defaultPricingStore.getTranslatorPrice(clientPrice, matchedType, bu) ?? 0
      : 0;
    return {
      id: `item-case-${Date.now()}-${idx}`,
      taskType: matchedType as TaskType,
      billingUnit: bu,
      unitCount: Number(g.unitCount) || 0,
      unitPrice: translatorPrice,
    };
  });

  const resolveAssignee = (name: string): string => {
    const assigneeOptions = selectOptionsStore.getSortedOptions("assignee");
    const m = assigneeOptions.find((o) => o.label === name || o.email === name);
    return m ? m.label : name;
  };

  const firstAssignee = translators.length > 0 ? resolveAssignee(translators[0]) : "";
  const isMulti = translators.length > 1;
  const baseTitle = caseTitle ? `PO_${caseTitle}` : "";
  const firstTitle = isMulti ? `${baseTitle}_01` : baseTitle;

  const feeIds: string[] = [];

  const firstFeeId = crypto.randomUUID();
  feeIds.push(firstFeeId);
  const firstFee: TranslatorFee = {
    id: firstFeeId,
    title: firstTitle,
    assignee: firstAssignee,
    status: "draft",
    internalNote: caseTitle,
    internalNoteUrl: caseUrl,
    taskItems: mapped,
    clientInfo: {
      ...defaultClientInfo,
      clientTaskItems: mapped.map((m, idx) => ({
        id: `ci-case-${Date.now()}-${idx}`,
        taskType: m.taskType,
        billingUnit: m.billingUnit,
        unitCount: m.unitCount,
        clientPrice: caseClient
          ? defaultPricingStore.getClientPrice(caseClient, m.taskType, m.billingUnit) ?? 0
          : 0,
      })),
      ...(isMulti ? { sameCase: true, isFirstFee: true, notFirstFee: false } : {}),
      ...(caseClient ? { client: caseClient } : {}),
      ...(caseContact ? { contact: caseContact } : {}),
      ...(caseData.keyword ? { clientCaseId: caseData.keyword } : {}),
      ...(caseData.clientPoNumber ? { clientPoNumber: caseData.clientPoNumber } : {}),
      ...(caseData.clientCaseLink?.url ? { clientCaseLink: caseData.clientCaseLink } : {}),
      ...(caseData.dispatchRoute ? { dispatchRoute: caseData.dispatchRoute } : {}),
    },
    notes: [],
    editLogs: [],
    createdBy: createdByUserId,
    createdAt: new Date().toISOString(),
  };
  feeStore.addFee(firstFee);

  if (isMulti) {
    for (let i = 1; i < translators.length; i++) {
      const personAssignee = resolveAssignee(translators[i]);
      const pageTitle = `${baseTitle}_${String(i + 1).padStart(2, "0")}`;
      const newFeeId = crypto.randomUUID();
      feeIds.push(newFeeId);
      const newFee: TranslatorFee = {
        id: newFeeId,
        title: pageTitle,
        assignee: personAssignee,
        status: "draft",
        internalNote: caseTitle,
        internalNoteUrl: caseUrl,
        taskItems: mapped.map((item, idx) => ({ ...item, id: `item-clone-${Date.now()}-${idx}-${i}` })),
        clientInfo: {
          ...defaultClientInfo,
          clientTaskItems: mapped.map((m, idx) => ({
            id: `ci-clone-${Date.now()}-${idx}-${i}`,
            taskType: m.taskType,
            billingUnit: m.billingUnit,
            unitCount: m.unitCount,
            clientPrice: caseClient
              ? defaultPricingStore.getClientPrice(caseClient, m.taskType, m.billingUnit) ?? 0
              : 0,
          })),
          sameCase: true,
          isFirstFee: false,
          notFirstFee: true,
          ...(caseClient ? { client: caseClient } : {}),
          ...(caseContact ? { contact: caseContact } : {}),
          ...(caseData.keyword ? { clientCaseId: caseData.keyword } : {}),
          ...(caseData.clientPoNumber ? { clientPoNumber: caseData.clientPoNumber } : {}),
          ...(caseData.clientCaseLink?.url ? { clientCaseLink: caseData.clientCaseLink } : {}),
          ...(caseData.dispatchRoute ? { dispatchRoute: caseData.dispatchRoute } : {}),
        },
        notes: [],
        editLogs: [],
        createdBy: createdByUserId,
        createdAt: new Date().toISOString(),
      };
      feeStore.addFee(newFee);
    }
  }

  return {
    caseTitle: caseData.title,
    caseId: caseData.id,
    feeIds,
    feeCount: feeIds.length,
  };
}

/**
 * Check if a case already has linked fee records.
 */
export function caseHasLinkedFees(caseId: string): boolean {
  const caseUrl = `${window.location.origin}/cases/${caseId}`;
  const allFees = feeStore.getFees();
  return allFees.some((f) => f.internalNoteUrl === caseUrl);
}
