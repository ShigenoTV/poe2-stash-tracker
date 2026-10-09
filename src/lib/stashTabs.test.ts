import { describe, expect, it } from "vitest";
import { mergeScan } from "./stashTabs";
import type { ScanResult } from "./scanner";

function scan(positions: [number, number][], quantity = 1): ScanResult {
  return {
    slotSide: 70,
    identifyError: null,
    slots: positions.map(([x, y]) => ({
      x, y, w: 70, h: 70, quantity, iconPngBase64: "", descriptor: "", identification: null,
    })),
  };
}

const fragments: [number, number][] = [[30, 40], [111, 40], [192, 40], [300, 40], [390, 40], [480, 40]];
const currency: [number, number][] = [[20, 20], [100, 200], [500, 300]];

describe("mergeScan", () => {
  it("ajoute un onglet inconnu puis remplace le même onglet", () => {
    let tabs = mergeScan([], scan(fragments, 1));
    tabs = mergeScan(tabs, scan(currency));
    expect(tabs).toHaveLength(2);
    tabs = mergeScan(tabs, scan(fragments, 9));
    expect(tabs).toHaveLength(2);
    expect(tabs[0].scan.slots[0].quantity).toBe(9);
  });

  it("ignore un scan vide ou masqué", () => {
    const tabs = mergeScan([], scan(fragments));
    expect(mergeScan(tabs, scan([]))).toBe(tabs);
    expect(mergeScan(tabs, scan(fragments.slice(0, 3)))).toBe(tabs);
  });
});
