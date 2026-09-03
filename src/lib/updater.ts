import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Result of a manual update check, for the caller to show as a UI cue. */
export type UpdateOutcome =
  | { kind: "uptodate" }
  | { kind: "declined"; version: string } // update found, user declined install
  | { kind: "installing" } // downloading/installing → app is about to relaunch
  | { kind: "error"; message: string };

/**
 * Checks the update endpoint for a newer signed release. If found, prompts and
 * (on confirm) downloads, installs, and relaunches. Returns an outcome so the
 * caller can render a visual cue; `silent` (the automatic launch check) just
 * ignores the return and logs errors instead of surfacing them.
 */
export async function checkForUpdate(
  opts?: { silent?: boolean },
): Promise<UpdateOutcome> {
  const silent = opts?.silent ?? false;
  try {
    const update = await check();
    if (!update) return { kind: "uptodate" };

    const ok = window.confirm(
      `Job Tracker ${update.version} is available (you have ${update.currentVersion}).\n\nDownload and install now? The app will restart.`,
    );
    if (!ok) return { kind: "declined", version: update.version };

    await update.downloadAndInstall();
    await relaunch();
    return { kind: "installing" };
  } catch (e) {
    // In `tauri dev` (no installed bundle), on Android (updater is desktop-only),
    // or offline, check() throws — log for the silent launch check; return it
    // for a manual check to display.
    const message = e instanceof Error ? e.message : String(e);
    if (silent) console.warn("[updater]", e);
    return { kind: "error", message };
  }
}
