import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { findUpdate, installAndRestart } from "../lib/updater";

export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    findUpdate().then(setUpdate);
  }, []);

  if (!update) return null;

  const installing = progress !== undefined;

  async function install() {
    if (!update) return;
    setError(null);
    setProgress(null);
    try {
      await installAndRestart(update, setProgress);
    } catch (err) {
      setProgress(undefined);
      setError(String(err));
    }
  }

  return (
    <div className="update-banner" role="status">
      <span>
        Version {update.version} disponible
        {error && <span className="update-error"> · échec : {error}</span>}
      </span>
      <button type="button" onClick={install} disabled={installing}>
        {installing
          ? progress === null
            ? "Téléchargement…"
            : `Téléchargement ${progress}%`
          : "Mettre à jour et redémarrer"}
      </button>
    </div>
  );
}
