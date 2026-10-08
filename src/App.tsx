import { Logo } from "./components/common/Logo";

function App() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 bg-topbar text-fg">
      <Logo size={72} />
      <h1 className="text-3xl font-semibold">LibreTeX</h1>
      <div className="flex gap-2 text-sm">
        <span className="rounded bg-panel px-3 py-1">Interfaz</span>
        <span className="rounded bg-accent px-3 py-1 text-accent-fg">Recompilar</span>
        <span className="rounded bg-editor px-3 py-1 font-mono text-editor-fg">\LaTeX</span>
      </div>
    </main>
  );
}

export default App;
