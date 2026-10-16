import { useBuffers } from "../../store/buffers";
import { useProjectView } from "../../store/project";
import { useProjects } from "../../store/projects";
import { addToPreamble } from "./preamble";

export type AddResult = "added" | "already" | "noPreamble" | "noProject";

/**
 * Adds `\usepackage{name}` to the preamble of the open project's main file: edits its
 * buffer (the editor follows it), saves and shows the new line.
 */
export async function addToProjectPreamble(name: string): Promise<AddResult> {
  const mainFile = useProjects.getState().current?.mainFile;
  const buffers = useBuffers.getState();
  if (!mainFile || !buffers.projectId) return "noProject";
  await buffers.load(mainFile);
  const buffer = useBuffers.getState().buffers[mainFile];
  if (!buffer) throw new Error(useBuffers.getState().errors[mainFile] ?? mainFile);
  const edit = addToPreamble(buffer.content, name);
  if (edit.kind !== "added") return edit.kind;
  useBuffers.getState().setContent(mainFile, edit.text);
  await useBuffers.getState().save(mainFile);
  useProjectView.getState().goToLine(mainFile, edit.line);
  return "added";
}
