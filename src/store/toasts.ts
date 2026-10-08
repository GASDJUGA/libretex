import { create } from "zustand";

export type ToastKind = "info" | "error";

export type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
};

type ToastState = {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
};

/** How long a toast stays visible (errors stay longer so they can be read). */
const DURATION_MS: Record<ToastKind, number> = { info: 5000, error: 12000 };

let nextId = 1;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => get().dismiss(id), DURATION_MS[toast.kind]);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
