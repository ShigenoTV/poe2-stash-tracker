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
  // Même nom lu en jeu : c'est le même onglet, même si son contenu a beaucoup changé.
  const named = scan.tabName ? tabs.find((t) => t.scan.tabName === scan.tabName) : undefined;
  if (named) {
    best = named;
    bestScore = 1;
  }
  // Deux noms lus ou deux types d'onglet différents : deux onglets distincts, même à contenu semblable.
  const differs = (a?: string | null, b?: string | null) => !!a && !!b && a !== b;
  const otherName = (t: TabScan) =>
    differs(scan.tabName, t.scan.tabName) || differs(scan.stashType, t.scan.stashType);
  for (const tab of named ? [] : tabs.filter((t) => !otherName(t))) {
    const score = overlap(tab.scan, scan);
    if (score > bestScore) {
      best = tab;
      bestScore = score;
    }
  }
  if (best && bestScore >= SAME_TAB) {
    if (scan.slots.length < best.scan.slots.length * MIN_KEPT) return tabs;
    // Doublon : un autre onglet aux mêmes objets reconnus, aux mêmes places.
    const twin = (t: TabScan) => t !== best && !otherName(t) && overlap(t.scan, scan, true) >= SAME_TAB;
    const next = {
      ...scan,
      tabName: scan.tabName ?? best.scan.tabName,
      stashType: scan.stashType ?? best.scan.stashType,
    };
    return tabs.filter((t) => !twin(t)).map((t) => (t === best ? { ...t, scan: next } : t));
  }
  const id = tabs.reduce((m, t) => Math.max(m, t.id), 0) + 1;
  return [...tabs, { id, scan }];
}

const KEY = "stashTabs";

/** Onglets lus lors des lancements précédents : le net worth reste complet après un redémarrage. */
export function loadTabs(): TabScan[] {
  try {
    const raw = localStorage.getItem(KEY);
    const tabs = raw ? (JSON.parse(raw) as TabScan[]) : [];
    return Array.isArray(tabs) ? tabs.filter((t) => typeof t.id === "number" && Array.isArray(t.scan?.slots)) : [];
  } catch {
    return [];
  }
}

export function saveTabs(tabs: TabScan[]): void {
  try {
    if (tabs.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(tabs));
  } catch {
    // Stockage plein ou indisponible : les onglets restent valables jusqu'à la fermeture.
  }
}
