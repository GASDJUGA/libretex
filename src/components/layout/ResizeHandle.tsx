import { Separator } from "react-resizable-panels";

type ResizeHandleProps = {
  orientation?: "horizontal" | "vertical";
};

/** Divider between panels; `orientation` is the orientation of the parent Group. */
export function ResizeHandle({ orientation = "horizontal" }: ResizeHandleProps) {
  return (
    <Separator
      className={`${
        orientation === "horizontal" ? "w-1" : "h-1"
      } shrink-0 bg-black/35 transition-colors data-[separator=active]:bg-accent data-[separator=hover]:bg-accent/60`}
    />
  );
}
