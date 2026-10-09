import { describe, expect, it } from "vitest";
import { buildSnapshot } from "./snapshot";
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
    const snap = buildSnapshot(scan, prices, new Date("2026-10-09T15:00:00Z"));
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0]).toMatchObject({ quantity: 150, category: "Fragment", icon: "https://web.poecdn.com/s.png" });
    expect(snap.items[0].unitExalted).toBeCloseTo(0.0058 * 771);
  });

  it("garde les cases non identifiées sans valeur, avec l'icône capturée", () => {
    const scan: ScanResult = { slotSide: 70, identifyError: null, slots: [slot(0, 3, null), slot(80, null, null)] };
    const snap = buildSnapshot(scan, prices);
    expect(snap.items).toEqual([
      expect.objectContaining({ quantity: 3, unitExalted: null, icon: "data:image/png;base64,AAA" }),
    ]);
  });
});
