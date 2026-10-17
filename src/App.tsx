import { Home } from "./app/Home";
import { Project } from "./app/Project";
import { Toaster } from "./components/common/Toaster";
import { useEffect } from "react";
import { notifyError } from "./lib/errors";
import { useAppStore } from "./store/app";
import { useSettings } from "./store/settings";
import { useTex } from "./store/tex";
import { applyEditorAppearance } from "./lib/appearance";

function App() {
  const route = useAppStore((s) => s.route);

  // Detect the TeX tools once at startup (cached by the backend), and read the settings.
  useEffect(() => {
    useTex.getState().load().catch(notifyError);
    useSettings.getState().load().catch(notifyError);
  }, []);

  // Editor theme and font, applied live.
  const editorTheme = useSettings((s) => s.editorTheme);
  const editorFontFamily = useSettings((s) => s.editorFontFamily);
  const editorFontSize = useSettings((s) => s.editorFontSize);
  useEffect(
    () => applyEditorAppearance({ editorTheme, editorFontFamily, editorFontSize }),
    [editorTheme, editorFontFamily, editorFontSize],
  );

  return (
    <>
      {route.name === "project" ? <Project projectId={route.projectId} /> : <Home />}
      <Toaster />
    </>
  );
}

export default App;
