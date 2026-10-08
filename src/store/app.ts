import { create } from "zustand";

export type Route = { name: "home" } | { name: "project"; projectId: string };

type AppState = {
  route: Route;
  openProject: (projectId: string) => void;
  goHome: () => void;
};

export const useAppStore = create<AppState>()((set) => ({
  route: { name: "home" },
  openProject: (projectId) => set({ route: { name: "project", projectId } }),
  goHome: () => set({ route: { name: "home" } }),
}));
