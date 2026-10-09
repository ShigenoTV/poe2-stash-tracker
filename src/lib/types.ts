/** Les onglets spéciaux du coffre, dans l'ordre du jeu, puis « Autres ». */
export const CATEGORIES = [
  "Currency",
  "Fragment",
  "Essence",
  "Delirium",
  "Socketable",
  "Ritual",
  "Breach",
  "Abyss",
  "Expedition",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  Currency: "Currency",
  Fragment: "Fragment",
  Essence: "Essence",
  Delirium: "Delirium",
  Socketable: "Socketable",
  Ritual: "Ritual",
  Breach: "Breach",
  Abyss: "Abyss",
  Expedition: "Expedition",
  Other: "Autres",
};

/** Catégorie d'affichage à partir du type d'overview poe.ninja. */
export function categoryOf(ninjaType: string): Category {
  switch (ninjaType) {
    case "Currency":
      return "Currency";
    case "Fragments":
      return "Fragment";
    case "Breach":
      return "Breach";
    case "Abyss":
      return "Abyss";
    case "Expedition":
      return "Expedition";
    case "Essences":
      return "Essence";
    case "Delirium":
      return "Delirium";
    case "Runes":
    case "SoulCores":
    case "Idols":
      return "Socketable";
    case "Ritual":
      return "Ritual";
    default:
      return "Other";
  }
}

export interface SnapshotItem {
  id: string;
  name: string;
  category: Category;
  quantity: number;
  /** Prix unitaire en Exalted Orbs, `null` si l'objet n'est pas identifié ou sans prix. */
  unitExalted: number | null;
  /** URL de l'icône (poe.ninja) ou image capturée en data URI. */
  icon?: string;
}

export interface Snapshot {
  id: string;
  takenAt: string;
  league: string;
  /** Combien d'Exalted vaut 1 Divine au moment du snapshot. */
  exaltedPerDivine: number;
  /** Combien de Chaos vaut 1 Divine (absent des snapshots plus anciens). */
  chaosPerDivine?: number;
  items: SnapshotItem[];
}
