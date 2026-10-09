import type { PriceFile } from "./scanner";
import { categoryOf, type Category, type Snapshot } from "./types";

/** Quantité détenue de chaque objet identifié, par identifiant poe.ninja. */
export type Holdings = Record<string, number>;

/** Objets identifiés d'un snapshot (les cases inconnues n'ont pas d'identité stable). */
export function holdingsOf(snapshot: Snapshot): Holdings {
  const out: Holdings = {};
  for (const item of snapshot.items) if (!item.id.startsWith("unknown-")) out[item.id] = item.quantity;
  return out;
}

export interface DeltaRow {
  id: string;
  name: string;
  icon?: string;
  category: Category;
  before: number;
  after: number;
  /** Variation de valeur au prix actuel, en Exalted (`null` sans prix). */
  valueExalted: number | null;
}

/**
 * Ce qui est entré et sorti du coffre depuis `before`, valorisé au prix actuel : une hausse
 * des prix n'est pas comptée comme un gain, seuls les objets gagnés ou dépensés le sont.
 */
export function compareHoldings(
  before: Holdings,
  current: Snapshot,
  prices: PriceFile | null,
): { rows: DeltaRow[]; totalExalted: number } {
  const exaltedPerDivine = prices?.rates.exalted ?? current.exaltedPerDivine;
  const priced = new Map((prices?.items ?? []).map((i) => [i.id, i]));
  const now = new Map(current.items.filter((i) => !i.id.startsWith("unknown-")).map((i) => [i.id, i]));
  const rows: DeltaRow[] = [];
  for (const id of new Set([...Object.keys(before), ...now.keys()])) {
    const after = now.get(id)?.quantity ?? 0;
    const was = before[id] ?? 0;
    if (after === was) continue;
    const item = now.get(id);
    const ref = priced.get(id);
    const unit = item?.unitExalted ?? (ref ? ref.value * exaltedPerDivine : null);
    rows.push({
      id,
      name: item?.name ?? ref?.name ?? id,
      icon: item?.icon ?? ref?.icon ?? undefined,
      category: item?.category ?? (ref ? categoryOf(ref.category) : "Other"),
      before: was,
      after,
      valueExalted: unit === null ? null : unit * (after - was),
    });
  }
  rows.sort((a, b) => Math.abs(b.valueExalted ?? 0) - Math.abs(a.valueExalted ?? 0));
  return { rows, totalExalted: rows.reduce((sum, r) => sum + (r.valueExalted ?? 0), 0) };
}
