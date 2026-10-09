import { describe, expect, it } from "vitest";
import { formatMoney, fromDivine, fromExalted, usable } from "./currency";

const rates = { exaltedPerDivine: 800, chaosPerDivine: 10 };

describe("conversion de devise", () => {
  it("convertit depuis les Exalted", () => {
    expect(fromExalted(1600, "exalted", rates)).toBe(1600);
    expect(fromExalted(1600, "divine", rates)).toBe(2);
    expect(fromExalted(1600, "chaos", rates)).toBe(20);
  });

  it("convertit depuis les Divine", () => {
    expect(fromDivine(3, "exalted", rates)).toBe(2400);
    expect(fromDivine(3, "chaos", rates)).toBe(30);
    expect(fromDivine(3, "divine", rates)).toBe(3);
  });

  it("retombe sur Divine sans taux Chaos", () => {
    const noChaos = { exaltedPerDivine: 800 };
    expect(usable("chaos", noChaos)).toBe("divine");
    expect(fromExalted(1600, "chaos", noChaos)).toBe(2);
  });

  it("formate avec l'abréviation", () => {
    expect(formatMoney(12.5, "divine")).toBe("12.5 div");
    expect(formatMoney(30, "chaos")).toBe("30 c");
  });
});
