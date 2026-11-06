/**
 * Confirmation dialog for destructive actions.
 *
 * `window.confirm` is a no-op in Tauri's macOS WKWebView and returns false, so
 * desktop builds must use the native dialog plugin instead.
 */
export type DestructiveConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export async function confirmDestructiveAction(
  message: string,
  options: DestructiveConfirmOptions = {}
): Promise<boolean> {
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    if (isTauri()) {
      const { confirm } = await import("@tauri-apps/plugin-dialog");
      return await confirm(message, {
        title: options.title ?? "ProseCraft",
        kind: "warning",
        okLabel: options.confirmLabel ?? "Delete",
        cancelLabel: options.cancelLabel ?? "Cancel"
      });
    }
  } catch (error) {
    console.error("Could not show the confirmation dialog.", error);
    return false;
  }

  return typeof window !== "undefined" && typeof window.confirm === "function"
    ? window.confirm(message)
    : false;
}
