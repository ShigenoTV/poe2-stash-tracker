import { invoke, isTauri } from "@tauri-apps/api/core";
import { fromDivine, type Currency, type Rates } from "./currency";
import type { Snapshot } from "./types";

export interface HistoryPoint {
  /** Millisecondes depuis l'epoch. */
  at: number;
  league: string;
  divine: number;
  exalted: number;
  /** Absent des points enregistrés avant l'affichage en Chaos. */
  chaos?: number;
}

/** Valeur d'un point dans la devise affichée, au taux de l'époque quand il est connu. */
export function pointValue(p: HistoryPoint, currency: Currency, rates: Rates): number {
  if (currency === "exalted") return p.exalted;
  if (currency === "chaos" && p.chaos !== undefined) return p.chaos;
  return fromDivine(p.divine, currency, rates);
}

export async function loadHistory(): Promise<HistoryPoint[]> {
  return isTauri() ? invoke<HistoryPoint[]>("load_history") : [];
}

/** Efface la courbe d'une ligue, ou toutes les courbes sans ligue. */
export function clearHistory(league: string | null): Promise<HistoryPoint[]> {
  return invoke<HistoryPoint[]>("clear_history", { league });
}

/** Enregistre la valeur d'un snapshot ; renvoie l'historique à jour. */
export function recordSnapshot(snapshot: Snapshot): Promise<HistoryPoint[]> {
  const exalted = snapshot.items.reduce((sum, i) => sum + (i.unitExalted ?? 0) * i.quantity, 0);
  const divine = exalted / snapshot.exaltedPerDivine;
  const point: HistoryPoint = {
    at: Date.parse(snapshot.takenAt),
    league: snapshot.league,
    divine,
    exalted,
    ...(snapshot.chaosPerDivine ? { chaos: divine * snapshot.chaosPerDivine } : {}),
  };
  return invoke<HistoryPoint[]>("record_history", { point });
}

/**
 * Tracé lissé qui ne dépasse jamais les valeurs réelles (interpolation monotone
 * de Fritsch–Carlson) : pas de faux creux ni de faux pics entre deux snapshots.
 */
export function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (dx[i] === 0 ? 0 : (p.y - pts[i].y) / dx[i]));
  const t = pts.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    const a = slope[i - 1];
    const b = slope[i];
    return a * b <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / a + (dx[i] + 2 * dx[i - 1]) / b);
  });
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i].x + h},${pts[i].y + t[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - t[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

/** Graduations « rondes » entre 0 et max (1, 2 ou 5 × 10^k). */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}
