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

function identified(positions: [number, number][], items: string[], dx = 0, dy = 0): ScanResult {
  const s = scan(positions.map(([x, y]) => [x + dx, y + dy]));
  s.slots.forEach((slot, i) => {
    slot.quantity = 10 + i;
    slot.identification = { source: "ninja", candidates: [{ itemId: items[i], distance: 0.01 }] };
  });
  return s;
}

describe("mergeScan : décalage et contenu", () => {
  const items = ["divine", "chaos", "greater-chaos", "key", "exalted", "regal"];

  it("reconnaît le même onglet décalé en bloc", () => {
    let tabs = mergeScan([], identified(fragments, items));
    tabs = mergeScan(tabs, identified(fragments, items, 30, 22));
    expect(tabs).toHaveLength(1);
  });

  it("garde séparés deux onglets aux mêmes places mais aux objets différents", () => {
    let tabs = mergeScan([], identified(fragments, items));
    tabs = mergeScan(tabs, identified(fragments, ["a", "b", "c", "d", "e", "f"]));
    expect(tabs).toHaveLength(2);
  });

  it("fusionne un doublon déjà présent", () => {
    const dup = [
      { id: 1, scan: identified(fragments, items) },
      { id: 2, scan: identified(fragments, items, 30, 22) },
    ];
    const tabs = mergeScan(dup, identified(fragments, items, 30, 22));
    expect(tabs).toHaveLength(1);
  });
});
