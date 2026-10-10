import type { Snapshot } from "./types";

export interface AlertSettings {
  enabled: boolean;
  /** Variation minimale du prix sur 24 h, en % (hausse ou baisse). */
  minChange: number;
  /** Valeur minimale détenue de l'objet, en Divine : on ignore les petites piles. */
  minHeldDivine: number;
}

export const DEFAULT_ALERTS: AlertSettings = { enabled: true, minChange: 15, minHeldDivine: 1 };

export interface PriceAlert {
  /** Clé de dédoublonnage : un objet, un sens, un jour de prix. */
  key: string;
  id: string;
  name: string;
  icon?: string;
  change24h: number;
  heldDivine: number;
}

/**
 * Objets détenus dont le prix a fortement bougé sur 24 h. Une alerte par objet, par sens et par
 * jour : un prix qui reste en hausse ne renotifie pas à chaque scan.
 */
export function findAlerts(snapshot: Snapshot, settings: AlertSettings, day: string): PriceAlert[] {
  if (!settings.enabled) return [];
  const out: PriceAlert[] = [];
  for (const item of snapshot.items) {
    const change = item.change24h;
    if (change === null || change === undefined || item.unitExalted === null) continue;
    if (Math.abs(change) < settings.minChange) continue;
    const heldDivine = (item.unitExalted * item.quantity) / snapshot.exaltedPerDivine;
    if (heldDivine < settings.minHeldDivine) continue;
    out.push({
      key: `${item.id}:${change > 0 ? "up" : "down"}:${day}`,
      id: item.id,
      name: item.name,
      icon: item.icon,
      change24h: change,
      heldDivine,
    });
  }
  return out.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
}

export function describeAlert(a: PriceAlert): string {
  const pct = `${a.change24h > 0 ? "+" : "−"}${Math.abs(a.change24h).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  const held = a.heldDivine.toLocaleString("fr-FR", { maximumFractionDigits: a.heldDivine < 10 ? 1 : 0 });
  return `${a.name} : ${pct} en 24 h (tu en as pour ${held} div)`;
}

const SETTINGS_KEY = "priceAlerts";
const SENT_KEY = "priceAlertsSent";

export function loadAlertSettings(): AlertSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_ALERTS, ...(JSON.parse(raw) as Partial<AlertSettings>) } : DEFAULT_ALERTS;
  } catch {
    return DEFAULT_ALERTS;
  }
}

export function saveAlertSettings(settings: AlertSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Stockage indisponible : le réglage vaut pour la session.
  }
}

/** Alertes déjà envoyées, pour ne pas renotifier (gardées quelques jours). */
export function loadSent(): string[] {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveSent(keys: string[]): void {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(keys.slice(-300)));
  } catch {
    // Au pire, une alerte reviendra au prochain lancement.
  }
}
