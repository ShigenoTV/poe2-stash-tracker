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

/** Transforme une réponse exchange/overview en lignes normalisées. */
export function normalizeOverview(type, data) {
  const core = data.core ?? {};
  const byId = new Map((core.items ?? []).map((item) => [item.id, item]));
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

async function main() {
  const outDir = process.argv[2] ?? "out";
  const forced = process.env.LEAGUES?.split(",").map((s) => s.trim()).filter(Boolean);
  const leagues = forced?.length
    ? forced.map((name) => ({ id: name, name }))
    : await getJson(`${BASE}/leagues`);

  const index = [];
  for (const { id, name } of leagues) {
    const file = await fetchLeague(id);
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
  await writeFile(join(outDir, "leagues.json"), JSON.stringify({ updatedAt: new Date().toISOString(), leagues: index }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
