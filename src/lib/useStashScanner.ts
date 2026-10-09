import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { buildSnapshot } from "./snapshot";
import { mergeScan, type TabScan } from "./stashTabs";
import {
  autoScan,
  captureGame,
  getPrices,
  labelSlot,
  loadRegion,
  resetAutoScan,
  saveRegion,
  scanRegion,
  type CapturePreview,
  type PriceFile,
  type Region,
  type ScanResult,
} from "./scanner";
import type { Snapshot } from "./types";

/** Délai entre deux tours du scan automatique. */
const AUTO_INTERVAL_MS = 1200;

/**
 * Moteur du scanner, monté au niveau de l'app pour que le scan automatique continue
 * quand on regarde l'onglet Snapshot.
 */
export function useStashScanner(onSnapshot: (s: Snapshot) => void) {
  const [preview, setPreview] = useState<CapturePreview | null>(null);
  const [region, setRegionState] = useState<Region | null>(loadRegion);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [tabs, setTabs] = useState<TabScan[]>([]);
  const [prices, setPrices] = useState<PriceFile | null>(null);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAutoScan, setLastAutoScan] = useState<Date | null>(null);

  const accept = useCallback((scan: ScanResult) => {
    setResult(scan);
    setTabs((t) => mergeScan(t, scan));
  }, []);

  // Le snapshot couvre tous les onglets vus depuis le dernier « Recommencer ».
  useEffect(() => {
    if (prices && tabs.length > 0) onSnapshot(buildSnapshot(tabs.map((t) => t.scan), prices));
  }, [tabs, prices, onSnapshot]);

  // Prix chargés dès le démarrage : taux de change (Chaos…) disponibles même sans nouveau scan.
  useEffect(() => {
    if (isTauri()) getPrices().then((p) => setPrices((cur) => cur ?? p)).catch(() => {});
  }, []);

  const ensurePrices = useCallback(async () => {
    if (!prices) setPrices(await getPrices());
  }, [prices]);

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await task();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function scan(r: Region) {
    const res = await run(() => scanRegion(r));
    if (!res) return;
    accept(res);
    if (!res.identifyError) await run(ensurePrices);
  }

  async function capture() {
    const p = await run(captureGame);
    if (!p) return;
    setPreview(p);
    if (region) await scan(region);
  }

  async function setRegion(r: Region) {
    setRegionState(r);
    saveRegion(r);
    await run(resetAutoScan);
    await scan(r);
  }

  async function pick(index: number, itemId: string) {
    if (!result) return;
    await run(() => labelSlot(result.slots[index].descriptor, itemId));
    const slots = result.slots.map((s, i) =>
      i === index ? { ...s, identification: { source: "memory" as const, candidates: [{ itemId, distance: 0 }] } } : s,
    );
    accept({ ...result, slots });
  }

  async function restart() {
    setTabs([]);
    setResult(null);
    await run(resetAutoScan);
  }

  // Boucle du scan automatique : un tour à la fois, jamais deux captures en parallèle.
  const autoRef = useRef(auto);
  autoRef.current = auto;
  useEffect(() => {
    if (!auto || !region) return;
    let stopped = false;
    (async () => {
      while (!stopped && autoRef.current) {
        try {
          const res = await autoScan(region);
          if (res.status === "scanned") {
            accept(res.scan);
            setLastAutoScan(new Date());
            if (!res.scan.identifyError) await ensurePrices();
          }
          setError(null);
        } catch (err) {
          setError(String(err));
        }
        await new Promise((r) => setTimeout(r, AUTO_INTERVAL_MS));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [auto, region, accept, ensurePrices]);

  return {
    preview, region, result, tabs, prices, auto, busy, error, lastAutoScan,
    capture, setRegion, pick, restart, setAuto,
  };
}

export type StashScanner = ReturnType<typeof useStashScanner>;
