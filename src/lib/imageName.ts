/**
 * Names for pasted images: what the user types, made safe for LaTeX (as Rust's
 * `check_image_name` requires): no accents, spaces or dots, lowercase, at most 80 characters.
 * «Diagrama espín (v2)» → `diagrama-espin-v2`.
 */
export function imageName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** `captura-2026-10-25-134512`: the paste's date and time, local. */
export function suggestedImageName(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return (
    `captura-${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-` +
    `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
  );
}
