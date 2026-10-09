import { invoke } from "@tauri-apps/api/core";

export interface Candidate {
  itemId: string;
  distance: number;
}

export interface Identification {
  /** `memory` : case déjà identifiée par le joueur ; `ninja` : rapprochement avec les icônes poe.ninja. */
  source: "memory" | "ninja";
  candidates: Candidate[];
}

export interface PricedItem {
  id: string;
  name: string;
  category: string;
  icon: string | null;
  /** Valeur en monnaie `primary` (Divine). */
  value: number;
  volume: number | null;
}

export interface PriceFile {
  league: string;
  fetchedAt: string;
  primary: string;
  rates: Record<string, number>;
  items: PricedItem[];
}

export interface ScannedSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  quantity: number | null;
  iconPngBase64: string;
  descriptor: string;
  identification: Identification | null;
}

export interface ScanResult {
  slotSide: number | null;
  slots: ScannedSlot[];
  identifyError: string | null;
}

export type AutoScanResult =
  | { status: "unchanged" }
  | { status: "changing" }
  | { status: "noStash" }
  | { status: "scanned"; scan: ScanResult };

/** Un tour de scan automatique sur la zone fixe du coffre. */
export const autoScan = () => invoke<AutoScanResult>("auto_scan", { region: null });
export const resetAutoScan = () => invoke<void>("reset_auto_scan");
export const getPrices = () => invoke<PriceFile>("get_prices");
export const refreshPrices = () => invoke<PriceFile>("refresh_prices");
export const labelSlot = (descriptor: string, itemId: string) =>
  invoke<void>("label_slot", { descriptor, itemId });
export const forgetLabels = () => invoke<void>("forget_labels");

export interface League {
  id: string;
  name: string;
}

/** Ligues disponibles et ligue choisie (`null` = ligue en cours). */
export const listLeagues = () => invoke<{ leagues: League[]; selected: string | null }>("list_leagues");
export const setLeague = (league: string | null) => invoke<PriceFile>("set_league", { league });

/** Au-delà, la suggestion poe.ninja est jugée trop incertaine pour être comptée. */
export const NINJA_MAX_DISTANCE = 0.12;

/** Objet retenu pour une case, ou `null` si rien de fiable. */
export function chosenItem(slot: ScannedSlot): { itemId: string; confirmed: boolean } | null {
  const best = slot.identification?.candidates[0];
  if (!best) return null;
  if (slot.identification!.source === "memory") return { itemId: best.itemId, confirmed: true };
  return best.distance <= NINJA_MAX_DISTANCE ? { itemId: best.itemId, confirmed: false } : null;
}
