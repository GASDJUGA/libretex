import { create } from "zustand";

export type Route = { name: "home" } | { name: "project"; projectId: string };
export type HomeTab = "projects" | "trash" | "packages" | "settings";

type AppState = {
  route: Route;
  homeTab: HomeTab;
  openProject: (projectId: string) => void;
  goHome: (tab?: HomeTab) => void;
  setHomeTab: (tab: HomeTab) => void;
};

export const useAppStore = create<AppState>()((set) => ({
  route: { name: "home" },
  homeTab: "projects",
  openProject: (projectId) => set({ route: { name: "project", projectId } }),
  goHome: (tab) => set((s) => ({ route: { name: "home" }, homeTab: tab ?? s.homeTab })),
  setHomeTab: (homeTab) => set({ homeTab }),
}));
