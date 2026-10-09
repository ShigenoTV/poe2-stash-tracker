import type { Snapshot } from "./types";

// Données fictives pour construire l'interface avant le branchement de l'API GGG.
// Les prix ne sont pas réels.
export const mockSnapshot: Snapshot = {
  id: "mock-1",
  takenAt: "2026-10-09T13:30:00Z",
  league: "Standard",
  exaltedPerDivine: 400,
  items: [
    { id: "exalted", name: "Exalted Orb", category: "Currency", quantity: 12_480, unitExalted: 1 },
    { id: "chaos", name: "Chaos Orb", category: "Currency", quantity: 3_120, unitExalted: 8 },
    { id: "divine", name: "Divine Orb", category: "Currency", quantity: 264, unitExalted: 400 },
    { id: "regal", name: "Regal Orb", category: "Currency", quantity: 1_890, unitExalted: 0.3 },
    { id: "alch", name: "Orb of Alchemy", category: "Currency", quantity: 2_450, unitExalted: 0.6 },
    { id: "vaal", name: "Vaal Orb", category: "Currency", quantity: 410, unitExalted: 2 },
    { id: "annul", name: "Orb of Annulment", category: "Currency", quantity: 37, unitExalted: 45 },
    { id: "gcp", name: "Gemcutter's Prism", category: "Currency", quantity: 152, unitExalted: 3 },
    { id: "transmute", name: "Orb of Transmutation", category: "Currency", quantity: 8_900, unitExalted: 0.02 },
    { id: "augment", name: "Orb of Augmentation", category: "Currency", quantity: 6_300, unitExalted: 0.03 },
    { id: "ess-ice", name: "Greater Essence of Ice", category: "Essence", quantity: 48, unitExalted: 4 },
    { id: "ess-haste", name: "Greater Essence of Haste", category: "Essence", quantity: 21, unitExalted: 6 },
    { id: "ess-hysteria", name: "Essence of Hysteria", category: "Essence", quantity: 3, unitExalted: 120 },
    { id: "dist-ire", name: "Distilled Ire", category: "Delirium", quantity: 95, unitExalted: 1.5 },
    { id: "dist-guilt", name: "Distilled Guilt", category: "Delirium", quantity: 61, unitExalted: 2.2 },
    { id: "dist-paranoia", name: "Distilled Paranoia", category: "Delirium", quantity: 12, unitExalted: 18 },
    { id: "rune-iron", name: "Greater Iron Rune", category: "Socketable", quantity: 34, unitExalted: 2 },
    { id: "soul-core", name: "Soul Core of Tacati", category: "Socketable", quantity: 9, unitExalted: 25 },
    { id: "talisman", name: "Unknown Talisman", category: "Socketable", quantity: 2, unitExalted: null },
    { id: "omen-light", name: "Omen of Light", category: "Ritual", quantity: 4, unitExalted: 90 },
    { id: "omen-whittling", name: "Omen of Whittling", category: "Ritual", quantity: 7, unitExalted: 30 },
  ],
};
