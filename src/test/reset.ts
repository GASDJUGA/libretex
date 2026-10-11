import { useI18n } from "../i18n";
import { createMockBackend } from "../lib/mockBackend";
import { setBackend } from "../lib/tauri";
import { useAppStore } from "../store/app";
import { initialBuffersState, useBuffers } from "../store/buffers";
import { initialCompileState, useCompile } from "../store/compile";
import { initialFilesState, useProjectFiles } from "../store/files";
import { initialIndexState, useProjectIndex } from "../store/projectIndex";
import { initialProjectViewState, useProjectView } from "../store/project";
import { initialProjectsState, useProjects } from "../store/projects";
import { useSettings } from "../store/settings";
import { initialTexState, useTex } from "../store/tex";
import { initialPackagesState, usePackages } from "../store/packages";
import { useToasts } from "../store/toasts";

/** Fresh mock backend and stores for each test. */
export function resetApp() {
  setBackend(createMockBackend());
  useAppStore.setState({ route: { name: "home" }, homeTab: "projects" });
  useProjects.setState(initialProjectsState);
  useProjectFiles.setState(initialFilesState);
  useProjectIndex.setState(initialIndexState);
  useBuffers.setState(initialBuffersState);
  useCompile.setState(initialCompileState);
  useProjectView.setState(initialProjectViewState);
  useToasts.setState({ toasts: [] });
  useTex.setState(initialTexState);
  usePackages.setState(initialPackagesState);
  useSettings.setState({
    indentMode: "environments",
    liveCheck: true,
    mathPreview: true,
    mathPreviewHover: false,
    pdfDarkMode: false,
  });
  useI18n.setState({ locale: "es" });
}
