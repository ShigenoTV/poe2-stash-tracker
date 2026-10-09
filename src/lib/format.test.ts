import { describe, expect, it } from "vitest";
import { compactQuantity, formatValue } from "./format";

describe("compactQuantity", () => {
  it.each([
    [0, "0"],
    [264, "264"],
    [999, "999"],
    [1000, "1K"],
    [3050, "3K"],
    [3150, "3.1K"],
    [12_345, "12K"],
    [999_999, "999K"],
    [1_250_000, "1.2M"],
  ])("%d → %s", (n, expected) => {
    expect(compactQuantity(n)).toBe(expected);
  });
});

describe("formatValue", () => {
  it("garde deux décimales sous 1", () => expect(formatValue(0.4212)).toBe("0.42"));
  it("une décimale sous 100", () => expect(formatValue(12.5)).toBe("12.5"));
  it("retire le .0 inutile", () => expect(formatValue(12)).toBe("12"));
});
