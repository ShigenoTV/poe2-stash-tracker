import { chosenItem, type PriceFile, type ScanResult } from "./scanner";
import { categoryOf, type Snapshot, type SnapshotItem } from "./types";

/** Regroupe les cases scannées par objet et les valorise avec le fichier de prix. */
export function buildSnapshot(scans: ScanResult[], prices: PriceFile, takenAt = new Date()): Snapshot {
  const exaltedPerDivine = prices.rates.exalted ?? 1;
  const byId = new Map(prices.items.map((i) => [i.id, i]));
  const items = new Map<string, SnapshotItem>();

  const slots = scans.flatMap((scan, tab) => scan.slots.map((slot) => ({ slot, tab })));
  for (const { slot, tab } of slots) {
    if (slot.quantity === null) continue;
    const chosen = chosenItem(slot);
    const priced = chosen ? byId.get(chosen.itemId) : undefined;
    if (!priced) {
      // Objet non identifié : gardé avec l'icône capturée, sans valeur.
      const id = `unknown-${tab}-${slot.x}-${slot.y}`;
      items.set(id, {
        id,
        name: "Objet non identifié",
        category: "Other",
        quantity: slot.quantity,
        unitExalted: null,
        icon: `data:image/png;base64,${slot.iconPngBase64}`,
      });
      continue;
    }
    const existing = items.get(priced.id);
    if (existing) {
      existing.quantity += slot.quantity;
    } else {
      items.set(priced.id, {
        id: priced.id,
        name: priced.name,
        category: categoryOf(priced.category),
        quantity: slot.quantity,
        unitExalted: priced.value * exaltedPerDivine,
        icon: priced.icon ?? `data:image/png;base64,${slot.iconPngBase64}`,
      });
    }
  }

  return {
    id: takenAt.toISOString(),
    takenAt: takenAt.toISOString(),
    league: prices.league,
    exaltedPerDivine,
    ...(prices.rates.chaos ? { chaosPerDivine: prices.rates.chaos } : {}),
    items: [...items.values()],
  };
}

const KEY = "lastSnapshot";

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: Snapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Stockage indisponible : le snapshot reste affiché jusqu'à la fermeture.
  }
}
