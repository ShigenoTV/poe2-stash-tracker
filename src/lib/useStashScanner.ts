import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { buildSnapshot } from "./snapshot";
import { sleep } from "./sleep";
import { loadTabs, mergeScan, saveTabs, type TabScan } from "./stashTabs";
import {
  autoScan,
  getPrices,
  labelSlot,
  refreshPrices,
  resetAutoScan,
  setLeague,
  type PriceFile,
  type ScannedSlot,
} from "./scanner";
import type { Snapshot } from "./types";

/** Délai avant le tour suivant du scan automatique, selon ce que le tour a vu. */
const DELAY_MS = {
  /** Coffre ouvert, rien n'a bougé ou onglet lu : rythme normal. */
  idle: 1200,
  /** La zone bouge : on revient vite pour lire l'onglet dès qu'il est stable. */
  changing: 500,
  /** Coffre fermé : inutile de capturer aussi souvent. */
  noStash: 3000,
  /** Jeu absent ou capture impossible. */
  error: 5000,
};
const AUTO_KEY = "autoScan";
/** Les prix sont publiés chaque heure : on les relit toutes les 30 minutes (alertes à jour). */
const PRICE_REFRESH_MS = 30 * 60e3;

function loadAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Moteur du scan : lit le coffre à sa place fixe dans la fenêtre du jeu, dès qu'il change,
 * et tient à jour les prix.
 */
export function useStashScanner(onSnapshot: (s: Snapshot) => void) {
  const [tabs, setTabs] = useState<TabScan[]>(loadTabs);
  const [prices, setPrices] = useState<PriceFile | null>(null);
  const [auto, setAutoState] = useState(loadAuto);
  /** `false` quand le dernier tour n'a pas trouvé de coffre ouvert. */
  const [stashOpen, setStashOpen] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pricesBusy, setPricesBusy] = useState(false);
  const [lastAutoScan, setLastAutoScan] = useState<Date | null>(null);

  const setAuto = useCallback((on: boolean) => {
    setAutoState(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? "on" : "off");
    } catch {
      // Stockage indisponible : le choix vaut pour la session.
    }
  }, []);

  // Prix chargés dès le démarrage : taux de change (Chaos…) disponibles même sans nouveau scan.
  useEffect(() => {
    if (isTauri()) getPrices().then((p) => setPrices((cur) => cur ?? p)).catch(() => {});
  }, []);

  useEffect(() => saveTabs(tabs), [tabs]);

  // Prix relus en arrière-plan, sans message en cas d'échec : le bouton reste là pour forcer.
  useEffect(() => {
    if (!isTauri()) return;
    const id = setInterval(() => {
      refreshPrices()
        .then(setPrices)
        .catch(() => {});
    }, PRICE_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Le snapshot couvre tous les onglets lus, y compris lors des lancements précédents
  // (jusqu'à la remise à zéro).
  useEffect(() => {
    if (prices && tabs.length > 0) onSnapshot(buildSnapshot(tabs.map((t) => t.scan), prices));
  }, [tabs, prices, onSnapshot]);

  // Stable : la boucle de scan ne redémarre pas quand les prix arrivent.
  const pricesRef = useRef(prices);
  pricesRef.current = prices;
  const ensurePrices = useCallback(async () => {
    if (!pricesRef.current) setPrices(await getPrices());
  }, []);

  async function updatePrices(load: () => Promise<PriceFile>) {
    setPricesBusy(true);
    setError(null);
    try {
      setPrices(await load());
    } catch (err) {
      setError(String(err));
    } finally {
      setPricesBusy(false);
    }
  }

  /** Corrige l'objet d'une case ; l'app s'en souviendra aux prochains scans. */
  async function relabel(slot: ScannedSlot, itemId: string) {
    await labelSlot(slot.descriptor, itemId);
    const fixed = { source: "memory" as const, candidates: [{ itemId, distance: 0 }] };
    setTabs((ts) =>
      ts.map((t) => ({
        ...t,
        scan: {
          ...t.scan,
          slots: t.scan.slots.map((s) => (s.descriptor === slot.descriptor ? { ...s, identification: fixed } : s)),
        },
      })),
    );
  }

  /** Incrémenté à chaque remise à zéro : un scan lancé avant est ignoré. */
  const generation = useRef(0);

  async function restart() {
    generation.current += 1;
    setTabs([]);
    await resetAutoScan().catch(() => {});
  }

  // Boucle du scan automatique : un tour à la fois, jamais deux captures en parallèle.
  const autoRef = useRef(auto);
  autoRef.current = auto;
  useEffect(() => {
    if (!auto || !isTauri()) return;
    let stopped = false;
    (async () => {
      while (!stopped && autoRef.current) {
        let delay = DELAY_MS.idle;
        try {
          const gen = generation.current;
          const res = await autoScan();
          if (gen !== generation.current) continue;
          if (res.status === "scanned") {
            setTabs((t) => mergeScan(t, res.scan));
            setStashOpen(true);
            setLastAutoScan(new Date());
            if (!res.scan.identifyError) await ensurePrices();
          } else if (res.status === "noStash") {
            setStashOpen(false);
            delay = DELAY_MS.noStash;
          } else if (res.status === "changing") {
            delay = DELAY_MS.changing;
          }
          setError(null);
        } catch (err) {
          setError(String(err));
          delay = DELAY_MS.error;
        }
        await sleep(delay);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [auto, ensurePrices]);

  return {
    tabs,
    prices,
    auto,
    stashOpen,
    error,
    pricesBusy,
    lastAutoScan,
    setAuto,
    relabel,
    restart,
    refreshPrices: () => updatePrices(refreshPrices),
    changeLeague: (league: string | null) => updatePrices(() => setLeague(league)),
  };
}

export type StashScanner = ReturnType<typeof useStashScanner>;
