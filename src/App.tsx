import { Home } from "./app/Home";
import { Project } from "./app/Project";
import { Toaster } from "./components/common/Toaster";
import { useAppStore } from "./store/app";

function App() {
  const route = useAppStore((s) => s.route);

  return (
    <>
      {route.name === "project" ? <Project projectId={route.projectId} /> : <Home />}
      <Toaster />
    </>
  );
}

export default App;
