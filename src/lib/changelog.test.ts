import { describe, expect, it } from "vitest";
import { CHANGELOG, notesSince, parseChangelog } from "./changelog";

const TEXT = `# Notes

## À venir

- pas encore

## 0.1.8 (2026-10-16)

- a
- b

## 0.1.7 (2026-10-15)

- c
`;

describe("changelog", () => {
  it("lit les sections publiées et ignore « À venir »", () => {
    const all = parseChangelog(TEXT);
    expect(all.map((r) => r.version)).toEqual(["0.1.8", "0.1.7"]);
    expect(all[0]).toEqual({ version: "0.1.8", date: "2026-10-16", notes: ["a", "b"] });
  });

  it("montre les versions manquées depuis la dernière vue", () => {
    const all = parseChangelog(TEXT);
    expect(notesSince(all, "0.1.6", "0.1.8").map((r) => r.version)).toEqual(["0.1.8", "0.1.7"]);
    expect(notesSince(all, "0.1.8", "0.1.8")).toEqual([]);
    expect(notesSince(all, null, "0.1.8").map((r) => r.version)).toEqual(["0.1.8"]);
    expect(notesSince(all, "0.1.9", "0.1.10")).toEqual([]);
  });

  it("le CHANGELOG du dépôt se lit", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(CHANGELOG[0].notes.length).toBeGreaterThan(0);
  });
});
