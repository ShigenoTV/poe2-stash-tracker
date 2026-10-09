import type { ScanResult } from "./scanner";

/** Un onglet du coffre déjà scanné : son dernier scan complet. */
export interface TabScan {
  id: number;
  scan: ScanResult;
}

/** Part minimale de cases à la même place pour reconnaître un onglet déjà vu. */
const SAME_TAB = 0.6;
/** Un scan qui perd trop de cases d'un onglet connu est sans doute masqué (infobulle, menu). */
const MIN_KEPT = 0.6;

function overlap(a: ScanResult, b: ScanResult): number {
  const tol = Math.max(4, (a.slotSide ?? 70) / 8);
  const matched = a.slots.filter((s) =>
    b.slots.some((t) => Math.abs(s.x - t.x) <= tol && Math.abs(s.y - t.y) <= tol),
  ).length;
  // Rapporté au plus petit des deux, pour qu'un scan partiellement masqué reste reconnu ;
  // au plus grand si l'un des deux a trop peu de cases pour être significatif.
  const small = Math.min(a.slots.length, b.slots.length);
  const large = Math.max(a.slots.length, b.slots.length);
  return matched / Math.max(small >= 3 ? small : large, 1);
}

/**
 * Intègre un nouveau scan : il remplace l'onglet dont la disposition correspond,
 * sinon il devient un nouvel onglet. Un scan vide (coffre fermé) ne change rien.
 */
export function mergeScan(tabs: TabScan[], scan: ScanResult): TabScan[] {
  if (scan.slots.length === 0) return tabs;
  let best: TabScan | null = null;
  let bestScore = 0;
  for (const tab of tabs) {
    const score = overlap(tab.scan, scan);
    if (score > bestScore) {
      best = tab;
      bestScore = score;
    }
  }
  if (best && bestScore >= SAME_TAB) {
    if (scan.slots.length < best.scan.slots.length * MIN_KEPT) return tabs;
    return tabs.map((t) => (t === best ? { ...t, scan } : t));
  }
  const id = tabs.reduce((m, t) => Math.max(m, t.id), 0) + 1;
  return [...tabs, { id, scan }];
}
