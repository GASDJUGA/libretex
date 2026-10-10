import { useI18n } from "../i18n";
import { createMockBackend } from "../lib/mockBackend";
import { setBackend } from "../lib/tauri";
import { useAppStore } from "../store/app";
import { initialBuffersState, useBuffers } from "../store/buffers";
import { initialFilesState, useProjectFiles } from "../store/files";
import { initialIndexState, useProjectIndex } from "../store/projectIndex";
import { initialProjectViewState, useProjectView } from "../store/project";
import { initialProjectsState, useProjects } from "../store/projects";
import { useSettings } from "../store/settings";
import { useToasts } from "../store/toasts";

/** Fresh mock backend and stores for each test. */
export function resetApp() {
  setBackend(createMockBackend());
  useAppStore.setState({ route: { name: "home" }, homeTab: "projects" });
  useProjects.setState(initialProjectsState);
  useProjectFiles.setState(initialFilesState);
  useProjectIndex.setState(initialIndexState);
  useBuffers.setState(initialBuffersState);
  useProjectView.setState(initialProjectViewState);
  useToasts.setState({ toasts: [] });
  useSettings.setState({ indentMode: "environments" });
  useI18n.setState({ locale: "es" });
}
