/**
 * When a case title changes, update linked fee / invoice titles that match generated patterns.
 */
import type { TranslatorFee } from "@/data/fee-mock-data";
import type { Invoice } from "@/data/invoice-types";
import type { ClientInvoice } from "@/data/client-invoice-types";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface FeeTitlePatch {
  feeId: string;
  title?: string;
  internalNote?: string;
}

/**
 * Fees linked via internalNoteUrl === `${origin}/cases/${caseId}`.
 * Updates title / internalNote when they match PO_${oldTitle} patterns or exact old case title.
 */
export function patchesForFeesAfterCaseRename(
  caseId: string,
  oldTitle: string,
  newTitle: string,
  origin: string,
  fees: TranslatorFee[]
): FeeTitlePatch[] {
  const caseUrl = `${origin.replace(/\/$/, "")}/cases/${caseId}`;
  const poOld = `PO_${oldTitle}`;
  const poNew = `PO_${newTitle}`;
  const patches: FeeTitlePatch[] = [];

  for (const f of fees) {
    if (f.internalNoteUrl !== caseUrl) continue;
    const patch: FeeTitlePatch = { feeId: f.id };
    if (f.internalNote === oldTitle) {
      patch.internalNote = newTitle;
    }
    if (f.title === poOld || f.title.startsWith(`${poOld}_`)) {
      patch.title = f.title.replace(new RegExp(`^${escapeRegExp(poOld)}`), poNew);
    }
    if (patch.title !== undefined || patch.internalNote !== undefined) {
      patches.push(patch);
    }
  }

  return patches;
}

export interface InvoiceTitlePatch {
  invoiceId: string;
  newTitle: string;
}

/** Translator invoices: update title if it exactly matched a fee title we renamed */
export function patchesForTranslatorInvoicesAfterFeeRenames(
  invoices: Invoice[],
  feeOldTitleToNew: Map<string, string>
): InvoiceTitlePatch[] {
  const out: InvoiceTitlePatch[] = [];
  if (feeOldTitleToNew.size === 0) return out;

  for (const inv of invoices) {
    const oldT = inv.title.trim();
    if (!oldT) continue;
    for (const fid of inv.feeIds) {
      const newT = feeOldTitleToNew.get(`${fid}::${oldT}`);
      if (newT) {
        out.push({ invoiceId: inv.id, newTitle: newT });
        break;
      }
    }
  }
  return out;
}

/** Build map from (feeId + old fee title) -> new fee title for invoice matching */
export function feeTitleChangeMap(
  fees: TranslatorFee[],
  patches: FeeTitlePatch[]
): Map<string, string> {
  const m = new Map<string, string>();
  const byId = new Map(patches.map((p) => [p.feeId, p] as const));
  for (const f of fees) {
    const p = byId.get(f.id);
    if (!p?.title) continue;
    m.set(`${f.id}::${f.title.trim()}`, p.title);
  }
  return m;
}

export function patchesForClientInvoicesAfterFeeRenames(
  invoices: ClientInvoice[],
  feeOldTitleToNew: Map<string, string>
): InvoiceTitlePatch[] {
  const out: InvoiceTitlePatch[] = [];
  if (feeOldTitleToNew.size === 0) return out;

  for (const inv of invoices) {
    const oldT = inv.title.trim();
    if (!oldT) continue;
    for (const fid of inv.feeIds) {
      const newT = feeOldTitleToNew.get(`${fid}::${oldT}`);
      if (newT) {
        out.push({ invoiceId: inv.id, newTitle: newT });
        break;
      }
    }
  }
  return out;
}
