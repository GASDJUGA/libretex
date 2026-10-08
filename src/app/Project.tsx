import { Logo } from "../components/common/Logo";
import { mockProjects } from "../mocks/projects";
import { useAppStore } from "../store/app";

type ProjectProps = {
  projectId: string;
};

export function Project({ projectId }: ProjectProps) {
  const goHome = useAppStore((s) => s.goHome);
  const project = mockProjects.find((p) => p.id === projectId);

  return (
    <main className="flex h-full flex-col bg-panel text-fg">
      <header className="flex h-11 items-center gap-3 bg-topbar px-3">
        <button type="button" onClick={goHome} title="Volver al inicio">
          <Logo size={26} />
        </button>
        <span className="font-medium">{project?.name ?? projectId}</span>
      </header>
    </main>
  );
}
