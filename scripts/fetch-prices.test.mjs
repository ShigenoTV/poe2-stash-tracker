import { describe, expect, it } from "vitest";
import { keepMissing, normalizeOverview, priceChanges, slugify } from "./fetch-prices.mjs";

describe("normalizeOverview", () => {
  it("joint lignes et métadonnées de items et core.items", () => {
    const data = {
      core: {
        primary: "divine",
        rates: { exalted: 400 },
        items: [{ id: "divine", name: "Divine Orb", image: "/gen/image/divine.png", category: "Currency" }],
      },
      items: [{ id: "chaos", name: "Chaos Orb", image: "/gen/image/chaos.png", category: "Currency" }],
      lines: [
        { id: "chaos", primaryValue: 0.02, volumePrimaryValue: 150, sparkline: { totalChange: -8, data: [-2, -4, -8] } },
        { id: "mystery", primaryValue: 1 },
        { id: "broken" },
      ],
    };
    expect(normalizeOverview("Currency", data)).toEqual([
      { id: "chaos", name: "Chaos Orb", category: "Currency", icon: "https://web.poecdn.com/gen/image/chaos.png", value: 0.02, volume: 150, change24h: -4.2, change7d: -8 },
      { id: "mystery", name: "mystery", category: "Currency", icon: null, value: 1, volume: null, change24h: null, change7d: null },
    ]);
  });
});

describe("priceChanges", () => {
  it("tire la variation sur 24 h des deux derniers points cumulés", () => {
    // De +10 % à +21 % du prix de départ : +10 % sur la dernière journée.
    expect(priceChanges({ totalChange: 21, data: [5, 10, 21] })).toEqual({ change24h: 10, change7d: 21 });
    expect(priceChanges({ totalChange: 3, data: [3] })).toEqual({ change24h: 3, change7d: 3 });
    expect(priceChanges(undefined)).toEqual({ change24h: null, change7d: null });
  });
});

describe("slugify", () => {
  it("rend un nom de ligue utilisable en chemin", () => {
    expect(slugify("Rise of the Abyssal (HC)")).toBe("rise-of-the-abyssal-hc");
  });
});

describe("keepMissing", () => {
  const item = (id, value) => ({ id, name: id, category: "Essences", icon: null, value, volume: 1, change24h: 5, change7d: 9 });

  it("garde au dernier prix connu un objet absent de ce passage", () => {
    const previous = { fetchedAt: "2026-10-10T05:00:00Z", items: [item("perfect-essence-of-ruin", 0.003), item("chaos", 0.01)] };
    const file = { fetchedAt: "2026-10-11T07:00:00Z", items: [item("chaos", 0.02)] };
    expect(keepMissing(file, previous).items).toEqual([
      { ...item("chaos", 0.02), seenAt: "2026-10-11T07:00:00Z" },
      { ...item("perfect-essence-of-ruin", 0.003), seenAt: "2026-10-10T05:00:00Z", change24h: null },
    ]);
  });

  it("oublie un objet absent depuis plus de deux semaines", () => {
    const previous = { fetchedAt: "2026-10-11T00:00:00Z", items: [{ ...item("old", 1), seenAt: "2026-09-20T00:00:00Z" }] };
    const file = { fetchedAt: "2026-10-11T07:00:00Z", items: [] };
    expect(keepMissing(file, previous).items).toEqual([]);
    expect(keepMissing(file, null).items).toEqual([]);
  });
});
