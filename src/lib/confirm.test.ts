import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmDestructiveAction } from "./confirm";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("@tauri-apps/plugin-dialog");
  vi.resetModules();
});

describe("confirmDestructiveAction", () => {
  it("uses the browser confirm outside Tauri", async () => {
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

    await expect(confirmDestructiveAction("Delete this?")).resolves.toBe(true);
    expect(confirmMock).toHaveBeenCalledWith("Delete this?");
  });

  it("returns false when the browser confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await expect(confirmDestructiveAction("Delete this?")).resolves.toBe(false);
  });

  it("uses the native dialog inside Tauri", async () => {
    vi.resetModules();
    vi.stubGlobal("isTauri", true);
    const nativeConfirm = vi.fn(async () => true);
    vi.doMock("@tauri-apps/plugin-dialog", () => ({ confirm: nativeConfirm }));

    const { confirmDestructiveAction: confirmInTauri } = await import("./confirm");

    await expect(confirmInTauri("Delete this?")).resolves.toBe(true);
    expect(nativeConfirm).toHaveBeenCalledWith(
      "Delete this?",
      expect.objectContaining({ kind: "warning" })
    );
  });
});
