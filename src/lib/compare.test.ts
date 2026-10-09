import { describe, expect, it } from "vitest";
import { compareHoldings, holdingsOf } from "./compare";
import type { PriceFile } from "./scanner";
import type { Snapshot } from "./types";

const prices: PriceFile = {
  league: "L",
  fetchedAt: "",
  primary: "divine",
  rates: { exalted: 100 },
  items: [
    { id: "chaos", name: "Chaos Orb", category: "Currency", icon: null, value: 0.1, volume: null },
    { id: "divine", name: "Divine Orb", category: "Currency", icon: null, value: 1, volume: null },
  ],
};

const snapshot: Snapshot = {
  id: "s",
  takenAt: "2026-10-09T20:00:00Z",
  league: "L",
  exaltedPerDivine: 100,
  items: [
    { id: "chaos", name: "Chaos Orb", category: "Currency", quantity: 30, unitExalted: 10 },
    { id: "unknown-0-1-2", name: "Objet non identifié", category: "Other", quantity: 4, unitExalted: null },
  ],
};

describe("compareHoldings", () => {
  it("valorise au prix actuel ce qui est entré et sorti, y compris un objet disparu", () => {
    expect(holdingsOf(snapshot)).toEqual({ chaos: 30 });
    const { rows, totalExalted } = compareHoldings({ chaos: 10, divine: 3 }, snapshot, prices);
    expect(rows.map((r) => [r.id, r.before, r.after, r.valueExalted])).toEqual([
      ["divine", 3, 0, -300],
      ["chaos", 10, 30, 200],
    ]);
    expect(totalExalted).toBe(-100);
  });
});
