import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Cherche une mise à jour sur GitHub Releases. Silencieux hors Tauri ou en cas d'erreur réseau. */
export async function findUpdate(): Promise<Update | null> {
  if (!isTauri()) return null;
  try {
    return await check();
  } catch (err) {
    console.warn("Vérification de mise à jour impossible :", err);
    return null;
  }
}

export async function installAndRestart(
  update: Update,
  onProgress: (percent: number | null) => void,
): Promise<void> {
  let total = 0;
  let received = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      onProgress(total ? 0 : null);
    } else if (event.event === "Progress") {
      received += event.data.chunkLength;
      onProgress(total ? Math.round((received / total) * 100) : null);
    }
  });
  await relaunch();
}
