import { describe, expect, it } from "vitest";
import { snapshotCsv } from "./csv";

describe("snapshotCsv", () => {
  it("écrit une ligne par objet, au format d'Excel français", () => {
    const csv = snapshotCsv(
      [
        { id: "a", name: "Chaos Orb", category: "Currency", quantity: 12, unitExalted: 2.5, stash: "Currency", change24h: -3.2, doubtful: true },
        { id: "b", name: 'Objet "rare"; bizarre', category: "Other", quantity: 1, unitExalted: null },
      ],
      "exalted",
      { exaltedPerDivine: 100 },
    );
    const [head, a, b] = csv.split("\r\n");
    expect(head).toBe("Objet;Catégorie;Onglet;Quantité;Prix unitaire (Exalted);Total (Exalted);Variation 24 h (%);Variation 7 j (%);À vérifier");
    expect(a).toBe("Chaos Orb;Currency;Currency;12;2,5;30;-3,2;;oui");
    expect(b).toBe('"Objet ""rare""; bizarre";Autres;;1;;;;;');
  });
});
