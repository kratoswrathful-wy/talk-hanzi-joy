import { translatorFees as initialFees, type TranslatorFee } from "@/data/fee-mock-data";

// Simple reactive store for fees
type Listener = () => void;

let fees: TranslatorFee[] = [...initialFees];
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export const feeStore = {
  getFees: () => fees,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  addFee: (fee: TranslatorFee) => {
    fees = [fee, ...fees];
    notify();
  },

  updateFee: (id: string, updates: Partial<TranslatorFee>) => {
    fees = fees.map((f) => (f.id === id ? { ...f, ...updates } : f));
    notify();
  },

  deleteFee: (id: string) => {
    fees = fees.filter((f) => f.id !== id);
    notify();
  },

  getFeeById: (id: string) => fees.find((f) => f.id === id),

  createDraft: (): TranslatorFee => {
    const now = new Date();
    const newFee: TranslatorFee = {
      id: `fee-${Date.now()}`,
      title: "",
      assignee: "",
      status: "draft",
      internalNote: "",
      taskItems: [
        {
          id: `item-${Date.now()}`,
          taskType: "翻譯",
          billingUnit: "字",
          unitCount: 0,
          unitPrice: 0,
        },
      ],
      createdBy: "目前使用者",
      createdAt: now.toISOString(),
    };
    fees = [newFee, ...fees];
    notify();
    return newFee;
  },
};
