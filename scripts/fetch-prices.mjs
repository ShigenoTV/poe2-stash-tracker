// Récupère les prix PoE2 sur poe.ninja et écrit un fichier JSON compact par ligue.
// Lancé chaque heure par .github/workflows/prices.yml ; poe.ninja demande que les
// applications passent par leur propre backend plutôt que d'appeler l'API depuis
// chaque poste (https://poe.ninja/docs/api).
//
// Usage : node scripts/fetch-prices.mjs [dossier_sortie]   (défaut : out)
// Variable optionnelle LEAGUES="Ligue A,Standard" pour forcer les ligues.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://poe.ninja/poe2/api/economy";
const USER_AGENT =
  "poe2-stash-tracker-prices/1.0 (+https://github.com/ShigenoTV/poe2-stash-tracker)";

// Catégories d'échange documentées par poe.ninja pour PoE2.
const EXCHANGE_TYPES = [
  "Currency",
  "Fragments",
  "Abyss",
  "UncutGems",
  "LineageSupportGems",
  "Essences",
  "SoulCores",
  "Idols",
  "Runes",
  "Ritual",
  "Expedition",
  "Delirium",
  "Breach",
  "Verisium",
];

const POE_CDN = "https://web.poecdn.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (res.ok) return res.json();
    if (attempt >= 3 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`${res.status} ${res.statusText} sur ${url}`);
    }
    await sleep(attempt * 5000);
  }
}

export function slugify(league) {
  return league.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function iconUrl(image) {
  if (!image) return null;
  return image.startsWith("http") ? image : `${POE_CDN}${image.startsWith("/") ? "" : "/"}${image}`;
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Variations de prix tirées de la sparkline poe.ninja : `data` donne, jour après jour, l'écart
 * cumulé en % depuis le début des 7 derniers jours. Sur 24 h : les deux derniers points.
 */
export function priceChanges(sparkline) {
  const data = (sparkline?.data ?? []).filter((v) => typeof v === "number");
  const total = typeof sparkline?.totalChange === "number" ? sparkline.totalChange : null;
  let day = null;
  if (data.length >= 2) {
    const [prev, last] = data.slice(-2);
    day = ((100 + last) / (100 + prev) - 1) * 100;
  } else if (data.length === 1) {
    day = data[0];
  }
  return {
    change24h: day === null || !Number.isFinite(day) ? null : round1(day),
    change7d: total === null ? null : round1(total),
  };
}

/** Transforme une réponse exchange/overview en lignes normalisées. */
export function normalizeOverview(type, data) {
  const core = data.core ?? {};
  // Les métadonnées (nom, icône) sont dans `items` ; `core.items` ne décrit que les monnaies de référence.
  const byId = new Map([...(core.items ?? []), ...(data.items ?? [])].map((item) => [item.id, item]));
  return (data.lines ?? [])
    .filter((line) => typeof line.primaryValue === "number")
    .map((line) => {
      const meta = byId.get(line.id) ?? {};
      return {
        id: line.id,
        name: meta.name ?? line.id,
        category: type,
        icon: iconUrl(meta.image),
        value: line.primaryValue,
        volume: line.volumePrimaryValue ?? null,
        ...priceChanges(line.sparkline),
      };
    });
}

async function fetchLeague(league) {
  const items = [];
  let primary = null;
  let rates = {};
  for (const type of EXCHANGE_TYPES) {
    const url = `${BASE}/exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`;
    try {
      const data = await getJson(url);
      if (!primary && data.core?.primary) {
        primary = data.core.primary;
        rates = data.core.rates ?? {};
      }
      items.push(...normalizeOverview(type, data));
    } catch (err) {
      console.warn(`[${league}] ${type} ignoré : ${err.message}`);
    }
    await sleep(1500); // Requêtes séquentielles et espacées, par politesse envers poe.ninja.
  }
  return { league, fetchedAt: new Date().toISOString(), primary: primary ?? "divine", rates, items };
}

/** Nom de fichier stable d'une icône : `<hash>-<nom>.png`, tiré de son URL poecdn. */
export function iconFile(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return parts.slice(-2).join("-");
}

/**
 * Copie les icônes sur la branche prices : elles servent à tester la reconnaissance hors de
 * Windows (le CDN du jeu n'est pas joignable partout) et pourront servir de miroir à l'app.
 */
async function mirrorIcons(outDir, urls) {
  const dir = join(outDir, "icons");
  await mkdir(dir, { recursive: true });
  let ok = 0;
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`${res.status}`);
      await writeFile(join(dir, iconFile(url)), Buffer.from(await res.arrayBuffer()));
      ok++;
    } catch (err) {
      console.warn(`Icône ${url} ignorée : ${err.message}`);
    }
    await sleep(50);
  }
  console.log(`${ok}/${urls.length} icônes copiées`);
}

async function main() {
  const outDir = process.argv[2] ?? "out";
  const forced = process.env.LEAGUES?.split(",").map((s) => s.trim()).filter(Boolean);
  const leagues = forced?.length
    ? forced.map((name) => ({ id: name, name }))
    : await getJson(`${BASE}/leagues`);

  const index = [];
  const icons = new Set();
  for (const { id, name } of leagues) {
    const file = await fetchLeague(id);
    for (const item of file.items) if (item.icon) icons.add(item.icon);
    if (file.items.length === 0) {
      console.warn(`[${id}] aucun prix, ligue ignorée`);
      continue;
    }
    const slug = slugify(id);
    await mkdir(join(outDir, slug), { recursive: true });
    await writeFile(join(outDir, slug, "latest.json"), JSON.stringify(file));
    index.push({ id, name: name ?? id, slug, fetchedAt: file.fetchedAt, count: file.items.length });
    console.log(`[${id}] ${file.items.length} prix`);
  }
  if (index.length === 0) throw new Error("Aucune ligue récupérée");
  await mirrorIcons(outDir, [...icons]);
  await writeFile(join(outDir, "leagues.json"), JSON.stringify({ updatedAt: new Date().toISOString(), leagues: index }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
