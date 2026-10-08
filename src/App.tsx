import { Home } from "./app/Home";
import { Project } from "./app/Project";
import { useAppStore } from "./store/app";

function App() {
  const route = useAppStore((s) => s.route);

  return route.name === "project" ? <Project projectId={route.projectId} /> : <Home />;
}

export default App;
