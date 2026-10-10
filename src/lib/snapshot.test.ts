import { describe, expect, it } from "vitest";
import { buildSnapshot, expandTabName } from "./snapshot";
import type { PriceFile, ScanResult, ScannedSlot } from "./scanner";

const prices: PriceFile = {
  league: "Forbidden Rites",
  fetchedAt: "2026-10-09T14:41:59Z",
  primary: "divine",
  rates: { exalted: 771 },
  items: [
    { id: "simulacrum-splinter", name: "Simulacrum Splinter", category: "Fragments", icon: "https://web.poecdn.com/s.png", value: 0.0058, volume: 10 },
  ],
};

function slot(x: number, quantity: number | null, itemId: string | null, source: "memory" | "ninja" = "memory"): ScannedSlot {
  return {
    x, y: 0, w: 70, h: 70, quantity, iconPngBase64: "AAA", descriptor: "",
    identification: itemId ? { source, candidates: [{ itemId, distance: 0.01 }] } : null,
  };
}

describe("buildSnapshot", () => {
  it("additionne les cases du même objet et valorise en Exalted", () => {
    const scan: ScanResult = {
      slotSide: 70,
      identifyError: null,
      slots: [slot(0, 100, "simulacrum-splinter"), slot(80, 50, "simulacrum-splinter", "ninja")],
    };
    const snap = buildSnapshot([scan], prices, new Date("2026-10-09T15:00:00Z"));
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0]).toMatchObject({ quantity: 150, category: "Fragment", icon: "https://web.poecdn.com/s.png" });
    expect(snap.items[0].unitExalted).toBeCloseTo(0.0058 * 771);
  });

  it("garde les cases non identifiées sans valeur, avec l'icône capturée", () => {
    const scan: ScanResult = { slotSide: 70, identifyError: null, slots: [slot(0, 3, null), slot(80, null, null)] };
    const snap = buildSnapshot([scan], prices);
    expect(snap.items).toEqual([
      expect.objectContaining({ quantity: 3, unitExalted: null, icon: "data:image/png;base64,AAA" }),
    ]);
  });
});

describe("onglet d'origine", () => {
  it("nomme l'onglet d'après ses objets reconnus, y compris pour les objets non identifiés", () => {
    const tab: ScanResult = { slotSide: 70, identifyError: null, slots: [slot(0, 100, "simulacrum-splinter"), slot(80, 3, null)] };
    const empty: ScanResult = { slotSide: 70, identifyError: null, slots: [slot(0, 2, null)] };
    const snap = buildSnapshot([tab, empty], prices);
    expect(snap.items.map((i) => i.stash)).toEqual(["Fragment", "Fragment", "Onglet 2"]);
  });

  it("préfère le nom lu en jeu", () => {
    const tab: ScanResult = { slotSide: 70, identifyError: null, tabName: "brea", slots: [slot(0, 100, "simulacrum-splinter")] };
    expect(buildSnapshot([tab], prices).items[0].stash).toBe("Breach");
  });

  it("préfère le type d'onglet reconnu à sa disposition", () => {
    const tab: ScanResult = { slotSide: 70, identifyError: null, tabName: "Craft", stashType: "Currency", slots: [slot(0, 100, "simulacrum-splinter")] };
    expect(buildSnapshot([tab], prices).items[0].stash).toBe("Currency");
  });
});

describe("categoryOf", () => {
  it("range chaque type poe.ninja dans l'onglet du jeu", async () => {
    const { categoryOf } = await import("./types");
    expect(categoryOf("Breach")).toBe("Breach");
    expect(categoryOf("Abyss")).toBe("Abyss");
    expect(categoryOf("Expedition")).toBe("Expedition");
    expect(categoryOf("Fragments")).toBe("Fragment");
    expect(categoryOf("Runes")).toBe("Socketable");
    expect(categoryOf("UncutGems")).toBe("Other");
  });
});

describe("revalue", () => {
  it("reprend les prix et la ligue du nouveau fichier", async () => {
    const { revalue } = await import("./snapshot");
    const scan: ScanResult = { slotSide: 70, identifyError: null, slots: [slot(0, 10, "simulacrum-splinter")] };
    const snap = buildSnapshot([scan], prices);
    const next = revalue(snap, {
      ...prices,
      league: "Runes of Aldur",
      rates: { exalted: 500, chaos: 8 },
      items: [{ ...prices.items[0], value: 0.01 }],
    });
    expect(next.league).toBe("Runes of Aldur");
    expect(next.chaosPerDivine).toBe(8);
    expect(next.items[0].unitExalted).toBeCloseTo(5);
    expect(next.items[0].source).toEqual({ tab: 0, x: 0, y: 0 });
  });
});

describe("expandTabName", () => {
  it("complète les abréviations de catégorie", () => {
    expect(expandTabName("brea")).toBe("Breach");
    expect(expandTabName("cur")).toBe("Currency");
    expect(expandTabName("fragm")).toBe("Fragment");
    expect(expandTabName("Socketables")).toBe("Socketable");
    expect(expandTabName("expedition")).toBe("Expedition");
  });
  it("garde les autres noms", () => {
    expect(expandTabName("Flask")).toBe("Flask");
    expect(expandTabName("maps")).toBe("maps");
    expect(expandTabName("1")).toBe("1");
    expect(expandTabName("Au")).toBe("Au");
  });
});
