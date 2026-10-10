// Prix tirés directement du Currency Exchange du jeu (API publique de GGG, résumés horaires).
// https://www.pathofexile.com/developer/docs/reference#currencyexchange
//
// Chaque marché est une paire d'objets (identifiants « Metadata/Items/… ») avec, pour l'heure,
// la quantité échangée de chaque côté. On en tire un prix en Divine pondéré par le volume.

export const EXCHANGE_URL = "https://web.poecdn.com/api/currency-exchange/poe2";
/** Liste des objets de base (identifiant du jeu → nom, image), maintenue par la communauté. */
export const BASE_ITEMS_URL = "https://repoe-fork.github.io/poe2/base_items.json";
export const DIVINE = "Metadata/Items/Currency/CurrencyModValues";

/** Horodatages (début d'heure, en secondes) des `hours` dernières heures complètes. */
export function lastHours(now, hours) {
  const current = Math.floor(now / 3600_000) * 3600;
  return Array.from({ length: hours }, (_, i) => current - 3600 * (hours - i));
}

/**
 * Prix en Divine de chaque objet d'une ligue, à partir des marchés de plusieurs heures.
 * Un objet échangé contre la Divine est valorisé directement ; sinon à travers un objet déjà
 * valorisé (Exalted, Chaos…). À chaque fois : somme des valeurs reçues / quantité échangée.
 * Renvoie Map(identifiant → { value, volume }) ; `volume` = quantité échangée de l'objet.
 */
export function exchangePrices(markets, league) {
  const edges = new Map(); // id → [{ other, mine, theirs }]
  for (const m of markets) {
    if (m.league !== league || !Array.isArray(m.market_pair) || m.market_pair.length !== 2) continue;
    const [a, b] = m.market_pair;
    const va = Number(m.volume_traded?.[a] ?? 0);
    const vb = Number(m.volume_traded?.[b] ?? 0);
    if (!(va > 0 && vb > 0)) continue;
    if (!edges.has(a)) edges.set(a, []);
    if (!edges.has(b)) edges.set(b, []);
    edges.get(a).push({ other: b, mine: va, theirs: vb });
    edges.get(b).push({ other: a, mine: vb, theirs: va });
  }
  const prices = new Map([[DIVINE, { value: 1, volume: sumVolume(edges.get(DIVINE)) }]]);
  // Valorisation de proche en proche : d'abord les objets échangés contre la Divine.
  for (let pass = 0; pass < 4; pass++) {
    const found = [];
    for (const [id, list] of edges) {
      if (prices.has(id)) continue;
      let got = 0;
      let given = 0;
      for (const e of list) {
        const other = prices.get(e.other);
        if (!other) continue;
        got += e.theirs * other.value;
        given += e.mine;
      }
      if (given > 0) found.push([id, { value: got / given, volume: given }]);
    }
    if (found.length === 0) break;
    for (const [id, p] of found) prices.set(id, p);
  }
  return prices;
}

function sumVolume(list = []) {
  return list.reduce((s, e) => s + e.mine, 0);
}

/** « 2DItems/Currency/CurrencyModValues » d'une URL d'icône poe.ninja (chemin encodé en base64). */
export function iconArt(url) {
  try {
    const part = new URL(url).pathname.split("/").filter(Boolean)[2];
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    const f = json.find((x) => x && typeof x === "object" && "f" in x)?.f;
    return typeof f === "string" ? f : null;
  } catch {
    return null;
  }
}

/** Identifiant du jeu de chaque objet poe.ninja : par nom, sinon par image. */
export function matchItems(ninjaItems, baseItems) {
  const byName = new Map();
  const byArt = new Map();
  for (const [id, base] of Object.entries(baseItems)) {
    if (!id.startsWith("Metadata/Items/")) continue;
    if (base?.name && !byName.has(base.name)) byName.set(base.name, id);
    const art = base?.visual_identity?.dds_file?.replace(/^Art\//, "").replace(/\.dds$/, "");
    if (art && !byArt.has(art)) byArt.set(art, id);
  }
  const out = new Map();
  for (const item of ninjaItems) {
    const id = byName.get(item.name) ?? (item.icon ? byArt.get(iconArt(item.icon)) : undefined);
    if (id) out.set(item.id, id);
  }
  return out;
}

/** Au-dessous, trop peu d'échanges pour se fier au prix : poe.ninja reste utilisé. */
export const MIN_VOLUME = 3;

/**
 * Remplace les prix poe.ninja par ceux du Currency Exchange quand l'objet y a assez circulé.
 * `windows` : prix calculés sur des fenêtres de plus en plus longues (6 h, puis 24 h).
 */
export function applyExchange(file, gameIds, windows) {
  const pick = (gameId) => {
    for (const prices of windows) {
      const p = prices.get(gameId);
      if (p && p.volume >= MIN_VOLUME && Number.isFinite(p.value) && p.value > 0) return p;
    }
    return null;
  };
  let replaced = 0;
  const items = file.items.map((item) => {
    const gameId = gameIds.get(item.id);
    const p = gameId ? pick(gameId) : null;
    if (!p) return { ...item, source: "ninja" };
    replaced++;
    return { ...item, value: p.value, ninjaValue: item.value, exchangeVolume: Math.round(p.volume), source: "exchange" };
  });
  const rates = { ...file.rates };
  for (const [key, ninjaId] of [["exalted", "exalted"], ["chaos", "chaos"]]) {
    const v = items.find((i) => i.id === ninjaId && i.source === "exchange")?.value;
    if (v) rates[key] = 1 / v;
  }
  return { file: { ...file, rates, items }, replaced };
}

/** Écarts entre les deux sources, pour juger le résultat (journal du workflow). */
export function compareReport(items) {
  const rows = items
    .filter((i) => i.source === "exchange" && i.ninjaValue > 0)
    .map((i) => ({ name: i.name, exchange: i.value, ninja: i.ninjaValue, ratio: i.value / i.ninjaValue, volume: i.exchangeVolume }));
  const ratios = rows.map((r) => r.ratio).sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
  rows.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
  return { matched: rows.length, median, worst: rows.slice(0, 15) };
}
