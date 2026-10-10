import { Home } from "./app/Home";
import { Project } from "./app/Project";
import { Toaster } from "./components/common/Toaster";
import { useEffect } from "react";
import { notifyError } from "./lib/errors";
import { useAppStore } from "./store/app";
import { useTex } from "./store/tex";

function App() {
  const route = useAppStore((s) => s.route);

  // Detect the TeX tools once at startup (cached by the backend).
  useEffect(() => {
    useTex.getState().load().catch(notifyError);
  }, []);

  return (
    <>
      {route.name === "project" ? <Project projectId={route.projectId} /> : <Home />}
      <Toaster />
    </>
  );
}

export default App;
