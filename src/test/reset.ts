import { useI18n } from "../i18n";
import { createMockBackend } from "../lib/mockBackend";
import { resetSessions } from "../lib/session";
import { setBackend } from "../lib/tauri";
import { useAppStore } from "../store/app";
import { initialBackupState, useBackup } from "../store/backup";
import { useHelp } from "../store/help";
import { initialBuffersState, useBuffers } from "../store/buffers";
import { initialCompileState, useCompile } from "../store/compile";
import { initialFilesState, useProjectFiles } from "../store/files";
import { initialIndexState, useProjectIndex } from "../store/projectIndex";
import { initialProjectViewState, useProjectView } from "../store/project";
import { initialProjectsState, useProjects } from "../store/projects";
import { initialSearchState, useSearch } from "../store/search";
import { initialSpellState, useSpell } from "../store/spell";
import { resetWorkspaces } from "../store/workspaces";
import { resetPdfPool } from "../components/pdf/pdfPool";
import { initialSettingsState, useSettings } from "../store/settings";
import { initialTexState, useTex } from "../store/tex";
import { initialPackagesState, usePackages } from "../store/packages";
import { useToasts } from "../store/toasts";
import { usePasteImage } from "../store/pasteImage";

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
  useSearch.setState(initialSearchState);
  useBackup.setState(initialBackupState);
  useHelp.setState({ dialog: null });
  usePasteImage.setState({ pending: null });
  useSpell.setState(initialSpellState);
  resetWorkspaces();
  resetPdfPool();
  useTex.setState(initialTexState);
  usePackages.setState(initialPackagesState);
  useSettings.setState(initialSettingsState);
  useI18n.setState({ locale: "es" });
  // Where earlier tests left their projects.
  resetSessions();
  for (const key of Object.keys(localStorage)) {
    if (key.endsWith(":session")) localStorage.removeItem(key);
  }
}
