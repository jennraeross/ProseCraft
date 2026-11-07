import type { ExportPayload } from "./types";

export type SaveResult =
  | { outcome: "saved"; filename: string }
  | { outcome: "cancelled" }
  | { outcome: "downloaded"; filename: string };

function basename(path: string, fallback: string): string {
  return path.split(/[\\/]/).pop() || fallback;
}

async function downloadInBrowser(payload: ExportPayload): Promise<SaveResult> {
  // On phones the download folder is hard to reach inside a standalone PWA.
  // Offer the native share sheet first when the browser can share files.
  try {
    const file = new File([payload.blob], payload.filename, {
      type: payload.blob.type || "application/octet-stream"
    });
    if (
      window.matchMedia("(pointer: coarse)").matches &&
      navigator.canShare?.({ files: [file] })
    ) {
      await navigator.share({ files: [file], title: payload.filename });
      return { outcome: "downloaded", filename: payload.filename };
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { outcome: "cancelled" };
    }
    // Fall through to a regular download when sharing is unavailable.
  }

  const url = URL.createObjectURL(payload.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = payload.filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { outcome: "downloaded", filename: payload.filename };
}

/**
 * Uses the native save panel inside Tauri. In a plain browser (and during
 * `vite dev` outside the shell) it falls back to a normal file download.
 */
export async function saveExport(payload: ExportPayload): Promise<SaveResult> {
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    if (!isTauri()) return downloadInBrowser(payload);

    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      title: `Export ${payload.formatName}`,
      defaultPath: payload.filename,
      filters: [{ name: payload.formatName, extensions: [payload.extension] }]
    });
    if (!path) return { outcome: "cancelled" };
    const bytes = new Uint8Array(await payload.blob.arrayBuffer());
    await writeFile(path, bytes);
    return { outcome: "saved", filename: basename(path, payload.filename) };
  } catch (error) {
    console.error("Could not save the exported file.", error);
    throw error;
  }
}
