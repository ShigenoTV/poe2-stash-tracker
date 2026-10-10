import { describe, expect, it } from "vitest";
import { DIVINE, applyExchange, exchangePrices, iconArt, lastHours, matchItems } from "./exchange.mjs";

const EX = "Metadata/Items/Currency/CurrencyAddModToRare";
const CHAOS = "Metadata/Items/Currency/CurrencyRerollRare";
const OMEN = "Metadata/Items/Currency/OmenOnChaosPrefix";

const market = (a, b, va, vb, league = "L") => ({
  league,
  market_id: `${a}|${b}`,
  market_pair: [a, b],
  volume_traded: { [a]: va, [b]: vb },
});

describe("exchangePrices", () => {
  it("valorise en Divine, directement puis de proche en proche, pondéré par le volume", () => {
    const prices = exchangePrices(
      [
        market(DIVINE, EX, 10, 4000), // 1 ex = 1/400 div
        market(EX, DIVINE, 400, 2), // 1 ex = 1/200 div → moyenne pondérée : 3 div / 600 ex
        market(OMEN, EX, 2, 360), // 1 omen = 180 ex
        market(CHAOS, DIVINE, 5, 0), // rien d'échangé d'un côté : ignoré
        market(OMEN, EX, 50, 1, "Autre ligue"),
      ],
      "L",
    );
    expect(prices.get(EX).value).toBeCloseTo(12 / 4400);
    expect(prices.get(OMEN).value).toBeCloseTo(180 * (12 / 4400));
    expect(prices.has(CHAOS)).toBe(false);
  });
});

describe("lastHours", () => {
  it("donne les heures complètes, la plus ancienne d'abord", () => {
    expect(lastHours(Date.UTC(2026, 9, 10, 8, 42), 2)).toEqual([1791612000, 1791615600]);
  });
});

describe("matchItems", () => {
  it("relie poe.ninja au jeu par le nom, sinon par l'image", () => {
    const icon =
      "https://web.poecdn.com/gen/image/" +
      Buffer.from(JSON.stringify([25, 14, { f: "2DItems/Currency/AnnullOrb", scale: 1 }])).toString("base64url") +
      "/2daba8ccca/AnnullOrb.png";
    expect(iconArt(icon)).toBe("2DItems/Currency/AnnullOrb");
    const ids = matchItems(
      [
        { id: "divine", name: "Divine Orb", icon: null },
        { id: "annul", name: "Orb of Annulment (ninja)", icon },
        { id: "nope", name: "Inconnu", icon: null },
      ],
      {
        [DIVINE]: { name: "Divine Orb", visual_identity: { dds_file: "Art/2DItems/Currency/CurrencyModValues.dds" } },
        "Metadata/Items/Currency/CurrencyRemoveMod": { name: "Orb of Annulment", visual_identity: { dds_file: "Art/2DItems/Currency/AnnullOrb.dds" } },
      },
    );
    expect([...ids]).toEqual([
      ["divine", DIVINE],
      ["annul", "Metadata/Items/Currency/CurrencyRemoveMod"],
    ]);
  });
});

describe("applyExchange", () => {
  it("prend le prix du jeu s'il a assez circulé, garde poe.ninja sinon, et recalcule les taux", () => {
    const file = {
      league: "L",
      rates: { exalted: 380, chaos: 2 },
      items: [
        { id: "exalted", name: "Exalted Orb", value: 0.0026 },
        { id: "omen", name: "Omen", value: 0.5 },
        { id: "rare", name: "Rare", value: 3 },
      ],
    };
    const ids = new Map([["exalted", EX], ["omen", OMEN], ["rare", "x"]]);
    const short = new Map([[EX, { value: 0.0025, volume: 600 }], [OMEN, { value: 0.4, volume: 1 }]]);
    const long = new Map([[OMEN, { value: 0.45, volume: 8 }]]);
    const { file: out, replaced } = applyExchange(file, ids, [short, long]);
    expect(replaced).toBe(2);
    expect(out.items.map((i) => [i.id, i.value, i.source])).toEqual([
      ["exalted", 0.0025, "exchange"],
      ["omen", 0.45, "exchange"],
      ["rare", 3, "ninja"],
    ]);
    expect(out.rates.exalted).toBeCloseTo(400);
    expect(out.rates.chaos).toBe(2);
  });
});
