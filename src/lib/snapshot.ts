import { chosenItem, type PriceFile, type ScanResult } from "./scanner";
import { CATEGORY_LABEL, categoryOf, type Category, type Snapshot, type SnapshotItem } from "./types";

/** Regroupe les cases scannées par objet et les valorise avec le fichier de prix. */
export function buildSnapshot(scans: ScanResult[], prices: PriceFile, takenAt = new Date()): Snapshot {
  const exaltedPerDivine = prices.rates.exalted ?? 1;
  const byId = new Map(prices.items.map((i) => [i.id, i]));
  const items = new Map<string, SnapshotItem>();

  const slots = scans.flatMap((scan, tab) => scan.slots.map((slot) => ({ slot, tab })));
  const tabNames = nameTabs(scans, byId);
  const seenIn = new Map<string, Set<string>>();
  for (const { slot, tab } of slots) {
    if (slot.quantity === null) continue;
    const chosen = chosenItem(slot);
    const id = chosen && byId.has(chosen.itemId) ? chosen.itemId : `unknown-${tab}-${slot.x}-${slot.y}`;
    if (!seenIn.has(id)) seenIn.set(id, new Set());
    seenIn.get(id)!.add(tabNames[tab]);
  }
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
        source: { tab, x: slot.x, y: slot.y },
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
        source: { tab, x: slot.x, y: slot.y },
      });
    }
  }

  for (const item of items.values()) item.stash = [...(seenIn.get(item.id) ?? [])].join(", ");

  return {
    id: takenAt.toISOString(),
    takenAt: takenAt.toISOString(),
    league: prices.league,
    exaltedPerDivine,
    ...(prices.rates.chaos ? { chaosPerDivine: prices.rates.chaos } : {}),
    items: [...items.values()],
  };
}

/** Revalorise un snapshot enregistré avec un nouveau fichier de prix (actualisation, autre ligue). */
export function revalue(snapshot: Snapshot, prices: PriceFile): Snapshot {
  const exaltedPerDivine = prices.rates.exalted ?? 1;
  const byId = new Map(prices.items.map((i) => [i.id, i]));
  return {
    ...snapshot,
    league: prices.league,
    exaltedPerDivine,
    chaosPerDivine: prices.rates.chaos,
    items: snapshot.items.map((item) => {
      const priced = byId.get(item.id);
      return { ...item, unitExalted: priced ? priced.value * exaltedPerDivine : null };
    }),
  };
}

/**
 * Nomme chaque onglet scanné d'après la catégorie la plus représentée parmi ses objets reconnus
 * (« Expedition », « Fragment »…), sinon « Onglet N ».
 */
function nameTabs(scans: ScanResult[], byId: Map<string, PriceFile["items"][number]>): string[] {
  return scans.map((scan, tab) => {
    const counts = new Map<Category, number>();
    for (const slot of scan.slots) {
      const chosen = chosenItem(slot);
      const priced = chosen ? byId.get(chosen.itemId) : undefined;
      const category = priced && categoryOf(priced.category);
      if (category && category !== "Other") counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    const best = [...counts].sort((a, b) => b[1] - a[1])[0];
    return best ? CATEGORY_LABEL[best[0]] : `Onglet ${tab + 1}`;
  });
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

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Rien à effacer.
  }
}
