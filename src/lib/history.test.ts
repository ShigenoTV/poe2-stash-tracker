import { describe, expect, it } from "vitest";
import { monotonePath, niceTicks } from "./history";

describe("niceTicks", () => {
  it("couvre le maximum avec des pas ronds", () => {
    expect(niceTicks(35.3)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(0.8)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
    expect(niceTicks(0)).toEqual([0]);
  });
});

describe("monotonePath", () => {
  it("passe par chaque point", () => {
    const d = monotonePath([{ x: 0, y: 10 }, { x: 10, y: 5 }, { x: 20, y: 5 }]);
    expect(d.startsWith("M0,10")).toBe(true);
    expect(d).toContain(" 10,5");
    expect(d.endsWith(" 20,5")).toBe(true);
  });

  it("reste plat entre deux valeurs égales", () => {
    const d = monotonePath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 5 }, { x: 30, y: 9 }]);
    // Tangente nulle au point (10,5) : les points de contrôle restent à y = 5.
    expect(d).toContain("C13.333333333333334,5 16.666666666666668,5 20,5");
  });
});
