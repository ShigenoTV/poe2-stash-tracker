import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { findUpdate, installAndRestart } from "./updater";

export type CheckState = "idle" | "checking" | "upToDate" | "available" | "error";

/** État partagé de l'auto-update : vérification au démarrage, à la demande, installation. */
export function useUpdater() {
  const [version, setVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [state, setState] = useState<CheckState>("idle");
  const [progress, setProgress] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async (manual: boolean) => {
    setState("checking");
    setError(null);
    const result = await findUpdate();
    setUpdate(result.update);
    if (result.error) {
      setError(result.error);
      setState(manual ? "error" : "idle");
    } else {
      setState(result.update ? "available" : manual ? "upToDate" : "idle");
    }
  }, []);

  useEffect(() => {
    if (isTauri()) getVersion().then(setVersion).catch(() => {});
    check(false);
  }, [check]);

  const install = useCallback(async () => {
    if (!update) return;
    setError(null);
    setProgress(null);
    try {
      await installAndRestart(update, setProgress);
    } catch (err) {
      setProgress(undefined);
      setError(String(err));
    }
  }, [update]);

  return { version, update, state, progress, error, check, install };
}

export type Updater = ReturnType<typeof useUpdater>;
