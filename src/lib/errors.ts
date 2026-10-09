import { translate, useI18n, type TranslationKey } from "../i18n";
import { useToasts } from "../store/toasts";
import { isBackendError } from "./tauri";

/** User-facing text for an error from the backend (translated from its `code`). */
export function errorText(error: unknown): { text: string; detail?: string } {
  const locale = useI18n.getState().locale;
  if (isBackendError(error)) {
    const key = `errors.${error.code}` as TranslationKey;
    const text = translate(locale, key);
    return {
      text: text === key ? translate(locale, "errors.other") : text,
      detail: error.message,
    };
  }
  return {
    text: translate(locale, "errors.other"),
    detail: error instanceof Error ? error.message : String(error),
  };
}

/** Shows an error toast for a failed action. */
export function notifyError(error: unknown) {
  const { text, detail } = errorText(error);
  useToasts.getState().push({ kind: "error", title: text, detail });
}

export function notifyInfo(title: string) {
  useToasts.getState().push({ kind: "info", title });
}
