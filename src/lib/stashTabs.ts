import type { ScanResult, ScannedSlot } from "./scanner";

/** Un onglet du coffre déjà scanné : son dernier scan complet. */
export interface TabScan {
  id: number;
  scan: ScanResult;
}

/** Part minimale de cases à la même place pour reconnaître un onglet déjà vu. */
const SAME_TAB = 0.6;
/** Un scan qui perd trop de cases d'un onglet connu est sans doute masqué (infobulle, menu). */
const MIN_KEPT = 0.6;
/** Borne le nombre de décalages essayés (cases de quantité 1 nombreuses). */
const MAX_OFFSETS = 64;

const itemOf = (s: ScannedSlot) => s.identification?.candidates[0]?.itemId ?? null;

/**
 * Deux cases peuvent être la même : objets différents seulement si les deux sont reconnus.
 * En mode strict, il faut le même objet reconnu des deux côtés.
 */
function sameContent(s: ScannedSlot, t: ScannedSlot, strict = false): boolean {
  const a = itemOf(s);
  const b = itemOf(t);
  if (strict) return a !== null && a === b;
  return a === null || b === null || a === b;
}

/**
 * Part des cases de `a` retrouvées dans `b`. La capture peut décaler tout l'onglet
 * (fenêtre redimensionnée, barre de titre incluse ou non) : on essaie aussi les décalages
 * suggérés par les cases au même objet ou à la même quantité.
 */
function overlap(a: ScanResult, b: ScanResult, strict = false): number {
  const tol = Math.max(4, (a.slotSide ?? 70) / 8);
  const offsets: [number, number][] = [[0, 0]];
  for (const s of a.slots) {
    for (const t of b.slots) {
      const item = itemOf(s);
      const twin = item !== null ? item === itemOf(t) : s.quantity !== null && s.quantity === t.quantity;
      if (twin && sameContent(s, t)) offsets.push([t.x - s.x, t.y - s.y]);
    }
  }
  let matched = 0;
  const seen = new Set<string>();
  for (const [dx, dy] of offsets) {
    const key = `${Math.round(dx / tol)},${Math.round(dy / tol)}`;
    if (seen.has(key)) continue;
    if (seen.size >= MAX_OFFSETS) break;
    seen.add(key);
    const n = a.slots.filter((s) =>
      b.slots.some(
        (t) => Math.abs(s.x + dx - t.x) <= tol && Math.abs(s.y + dy - t.y) <= tol && sameContent(s, t, strict),
      ),
    ).length;
    matched = Math.max(matched, n);
  }
  // Rapporté au plus petit des deux, pour qu'un scan partiellement masqué reste reconnu ;
  // au plus grand si l'un des deux a trop peu de cases pour être significatif.
  const small = Math.min(a.slots.length, b.slots.length);
  const large = Math.max(a.slots.length, b.slots.length);
  return matched / Math.max(small >= 3 ? small : large, 1);
}

/**
 * Intègre un nouveau scan : il remplace l'onglet dont la disposition correspond,
 * sinon il devient un nouvel onglet. Un scan vide (coffre fermé) ne change rien.
 * Les doublons d'un même onglet, s'il y en a, sont fusionnés au passage.
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
    // Doublon : un autre onglet aux mêmes objets reconnus, aux mêmes places.
    const twin = (t: TabScan) => t !== best && overlap(t.scan, scan, true) >= SAME_TAB;
    return tabs.filter((t) => !twin(t)).map((t) => (t === best ? { ...t, scan } : t));
  }
  const id = tabs.reduce((m, t) => Math.max(m, t.id), 0) + 1;
  return [...tabs, { id, scan }];
}
