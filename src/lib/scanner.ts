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

export interface ScannedSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  quantity: number | null;
  iconPngBase64: string;
}

export interface ScanResult {
  slotSide: number | null;
  slots: ScannedSlot[];
}

export const captureGame = () => invoke<CapturePreview>("capture_game");
export const scanRegion = (region: Region) => invoke<ScanResult>("scan_region", { region });

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
