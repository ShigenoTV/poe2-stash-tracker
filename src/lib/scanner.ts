import { invoke } from "@tauri-apps/api/core";

export interface CapturePreview {
  width: number;
  height: number;
  method: "wgc" | "gdi";
  pngBase64: string;
}

/** Zone du coffre en fractions de l'image (0..1). */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

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

export const captureGame = () => invoke<CapturePreview>("capture_game");
export const scanRegion = (region: Region) => invoke<ScanResult>("scan_region", { region });
export type AutoScanResult =
  | { status: "unchanged" }
  | { status: "changing" }
  | { status: "scanned"; scan: ScanResult };

export const autoScan = (region: Region) => invoke<AutoScanResult>("auto_scan", { region });
export const resetAutoScan = () => invoke<void>("reset_auto_scan");
export const getPrices = () => invoke<PriceFile>("get_prices");
export const labelSlot = (descriptor: string, itemId: string) =>
  invoke<void>("label_slot", { descriptor, itemId });

/** Au-delà, la suggestion poe.ninja est jugée trop incertaine pour être comptée. */
export const NINJA_MAX_DISTANCE = 0.12;

/** Objet retenu pour une case, ou `null` si rien de fiable. */
export function chosenItem(slot: ScannedSlot): { itemId: string; confirmed: boolean } | null {
  const best = slot.identification?.candidates[0];
  if (!best) return null;
  if (slot.identification!.source === "memory") return { itemId: best.itemId, confirmed: true };
  return best.distance <= NINJA_MAX_DISTANCE ? { itemId: best.itemId, confirmed: false } : null;
}

const REGION_KEY = "stashRegion";

export function loadRegion(): Region | null {
  try {
    const raw = localStorage.getItem(REGION_KEY);
    return raw ? (JSON.parse(raw) as Region) : null;
  } catch {
    return null;
  }
}

export function saveRegion(region: Region): void {
  try {
    localStorage.setItem(REGION_KEY, JSON.stringify(region));
  } catch {
    // Stockage indisponible : la zone sera redemandée.
  }
}
