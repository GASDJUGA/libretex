import { useI18n } from "../i18n";
import { createMockBackend } from "../lib/mockBackend";
import { setBackend } from "../lib/tauri";
import { useAppStore } from "../store/app";
import { initialProjectViewState, useProjectView } from "../store/project";
import { initialProjectsState, useProjects } from "../store/projects";
import { useToasts } from "../store/toasts";

/** Fresh mock backend and stores for each test. */
export function resetApp() {
  setBackend(createMockBackend());
  useAppStore.setState({ route: { name: "home" }, homeTab: "projects" });
  useProjects.setState(initialProjectsState);
  useProjectView.setState(initialProjectViewState);
  useToasts.setState({ toasts: [] });
  useI18n.setState({ locale: "es" });
}
