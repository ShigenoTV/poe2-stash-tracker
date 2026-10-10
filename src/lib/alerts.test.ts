import { describe, expect, it } from "vitest";
import { DEFAULT_ALERTS, findAlerts } from "./alerts";
import type { Snapshot } from "./types";

const snapshot: Snapshot = {
  id: "s",
  takenAt: "2026-10-10T06:00:00Z",
  league: "L",
  exaltedPerDivine: 100,
  items: [
    // 5 div détenues, +20 % : alerte.
    { id: "divine", name: "Divine Orb", category: "Currency", quantity: 5, unitExalted: 100, change24h: 20 },
    // 0,5 div détenue : trop peu pour alerter.
    { id: "omen", name: "Omen", category: "Other", quantity: 1, unitExalted: 50, change24h: -90 },
    // Variation trop faible.
    { id: "chaos", name: "Chaos Orb", category: "Currency", quantity: 300, unitExalted: 1, change24h: -5 },
    // Grosse baisse sur une grosse pile : alerte, en tête.
    { id: "exalted", name: "Exalted Orb", category: "Currency", quantity: 5000, unitExalted: 1, change24h: -30 },
    { id: "unknown", name: "?", category: "Other", quantity: 3, unitExalted: null, change24h: 80 },
  ],
};

describe("findAlerts", () => {
  it("ne garde que les fortes variations sur des objets détenus en quantité", () => {
    const alerts = findAlerts(snapshot, DEFAULT_ALERTS, "2026-10-10");
    expect(alerts.map((a) => [a.key, a.heldDivine])).toEqual([
      ["exalted:down:2026-10-10", 50],
      ["divine:up:2026-10-10", 5],
    ]);
  });

  it("ne renvoie rien quand les alertes sont coupées", () => {
    expect(findAlerts(snapshot, { ...DEFAULT_ALERTS, enabled: false }, "d")).toEqual([]);
  });
});
