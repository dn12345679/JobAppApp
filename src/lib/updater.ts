import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Checks the update endpoint for a newer signed release. If found, prompts and
 * (on confirm) downloads, installs, and relaunches. `silent` suppresses the
 * "you're up to date" / error dialogs (used for the automatic launch check).
 */
export async function checkForUpdate(opts?: { silent?: boolean }): Promise<void> {
  const silent = opts?.silent ?? false;
  try {
    const update = await check();
    if (!update) {
      if (!silent) alert("You're on the latest version.");
      return;
    }

    const ok = window.confirm(
      `Job Tracker ${update.version} is available (you have ${update.currentVersion}).\n\nDownload and install now? The app will restart.`,
    );
    if (!ok) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (e) {
    // In `tauri dev` (no installed bundle) or offline, check() throws — ignore
    // silently for the launch check; surface it for a manual check.
    if (silent) {
      console.warn("[updater]", e);
    } else {
      alert(`Update check failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
