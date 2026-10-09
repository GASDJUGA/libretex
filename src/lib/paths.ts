/** Helpers for project-relative paths (`/`-separated, `""` = project root). */

export const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export const parentOf = (path: string) => {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
};

export const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** Whether `path` is `base` or lies inside it. */
export const isWithin = (path: string, base: string) =>
  path === base || path.startsWith(`${base}/`);

/** `path` with its `from` prefix replaced by `to` (after a rename or move of `from`). */
export const remap = (path: string, from: string, to: string) =>
  isWithin(path, from) ? to + path.slice(from.length) : path;

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"];

export const extensionOf = (path: string) => {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const isImage = (path: string) => IMAGE_EXTENSIONS.includes(extensionOf(path));
export const isPdf = (path: string) => extensionOf(path) === "pdf";
