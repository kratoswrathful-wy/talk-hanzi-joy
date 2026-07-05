import { createContext, useContext } from "react";

interface DeleteConfirmContextValue {
  confirmDelete: (onConfirm: () => void, itemName?: string) => void;
}

export const DeleteConfirmContext = createContext<DeleteConfirmContextValue>({
  confirmDelete: () => {},
});

export function useDeleteConfirm() {
  return useContext(DeleteConfirmContext);
}
