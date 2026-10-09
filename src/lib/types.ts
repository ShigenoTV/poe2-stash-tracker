export const CATEGORIES = [
  "Currency",
  "Essence",
  "Delirium",
  "Socketable",
  "Ritual",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface SnapshotItem {
  id: string;
  name: string;
  category: Category;
  quantity: number;
  /** Prix unitaire en Exalted Orbs, `null` si poe.ninja ne le connaît pas. */
  unitExalted: number | null;
  icon?: string;
}

export interface Snapshot {
  id: string;
  takenAt: string;
  league: string;
  /** Combien d'Exalted vaut 1 Divine au moment du snapshot. */
  exaltedPerDivine: number;
  items: SnapshotItem[];
}
