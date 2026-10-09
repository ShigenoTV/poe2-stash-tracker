import { describe, expect, it } from "vitest";
import { normalizeOverview, slugify } from "./fetch-prices.mjs";

describe("normalizeOverview", () => {
  it("joint lignes et métadonnées core.items", () => {
    const data = {
      core: {
        primary: "divine",
        rates: { exalted: 400 },
        items: [{ id: "chaos", name: "Chaos Orb", image: "/gen/image/chaos.png", category: "Currency" }],
      },
      lines: [
        { id: "chaos", primaryValue: 0.02, volumePrimaryValue: 150 },
        { id: "mystery", primaryValue: 1 },
        { id: "broken" },
      ],
    };
    expect(normalizeOverview("Currency", data)).toEqual([
      { id: "chaos", name: "Chaos Orb", category: "Currency", icon: "https://web.poecdn.com/gen/image/chaos.png", value: 0.02, volume: 150 },
      { id: "mystery", name: "mystery", category: "Currency", icon: null, value: 1, volume: null },
    ]);
  });
});

describe("slugify", () => {
  it("rend un nom de ligue utilisable en chemin", () => {
    expect(slugify("Rise of the Abyssal (HC)")).toBe("rise-of-the-abyssal-hc");
  });
});
