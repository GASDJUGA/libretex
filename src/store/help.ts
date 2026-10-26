import { create } from "zustand";

/** The help dialogs (menu Ayuda, the rail's help button, F1). */
type HelpState = {
  dialog: "shortcuts" | "about" | null;
  show: (dialog: "shortcuts" | "about") => void;
  close: () => void;
};

export const useHelp = create<HelpState>()((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));
