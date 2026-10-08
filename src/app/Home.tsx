import { Logo } from "../components/common/Logo";
import { mockProjects } from "../mocks/projects";
import { useAppStore } from "../store/app";

export function Home() {
  const openProject = useAppStore((s) => s.openProject);

  return (
    <main className="flex h-full flex-col gap-4 bg-topbar p-8 text-fg">
      <h1 className="flex items-center gap-3 text-2xl font-semibold">
        <Logo size={32} /> LibreTeX
      </h1>
      <ul className="flex flex-col gap-1">
        {mockProjects.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="rounded px-2 py-1 hover:bg-hover"
              onClick={() => openProject(p.id)}
            >
              {p.name}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
