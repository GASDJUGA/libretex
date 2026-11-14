import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { animateLeave } from "../../lib/leaveAnimation";
import { LOAD_STEPS, barTarget, isLoaded, useLoading } from "../../store/loading";
import { useProjects } from "../../store/projects";
import { Logo } from "../common/Logo";

/** Longest the bar waits (a PDF that takes very long to draw shows the project anyway). */
export const LOADING_MAX_MS = 8000;

/**
 * «Cargando proyecto» over a project tab while it loads (pedido del usuario: como la barra de
 * un Mac al iniciarse): the logo and a thin bar that fills step by step. The logo and the bar
 * only show up if loading takes a moment, so a quick tab change doesn't flash them; the cover
 * fades out when the project is ready.
 */
export function ProjectLoading({ projectId }: { projectId: string }) {
  const t = useT();
  const name = useProjects((s) => s.projects.find((p) => p.id === projectId)?.name);
  const done = useLoading((s) => (s.projectId === projectId ? s.done.length : 0));
  const loaded = useLoading((s) => isLoaded(s, projectId));
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), LOADING_MAX_MS);
    return () => clearTimeout(timer);
  }, []);
  if (loaded || timedOut) return null;
  return (
    <Cover label={name ? t("project.loadingName", { name }) : t("project.loading")} done={done} />
  );
}

function Cover({ label, done }: { label: string; done: number }) {
  // It starts empty and moves toward its target from the first frame.
  const [shown, setShown] = useState(0.02);
  const target = barTarget(done);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);
  const ref = useRef<HTMLDivElement>(null);
  // Ready: it fades out (a copy) while the project comes in.
  useLayoutEffect(() => {
    const cover = ref.current;
    return () => animateLeave(cover);
  }, []);
  return (
    <div
      ref={ref}
      className="jt-loading absolute inset-0 z-20 flex items-center justify-center bg-topbar"
    >
      <div className="jt-loading-content flex flex-col items-center gap-5">
        <Logo size={56} />
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((100 * done) / LOAD_STEPS.length)}
          className="h-1.5 w-56 overflow-hidden rounded-full bg-fg/15"
        >
          <div
            className="jt-loading-bar h-full w-full origin-left rounded-full bg-fg/85"
            style={{ transform: `scaleX(${shown})` }}
          />
        </div>
        <p className="text-sm text-fg-muted">{label}</p>
      </div>
    </div>
  );
}
