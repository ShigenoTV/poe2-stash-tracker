# PoE2 Stash Tracker

Application desktop (Tauri 2 + React) qui suit le contenu des coffres de Path of Exile 2,
les valorise avec les prix de [poe.ninja](https://poe.ninja/poe2/) et trace le net worth dans le temps.

Design document : https://claude.ai/code/artifact/8b9a67bf-288a-4dd6-975c-ac81c403091e

## Développement

Prérequis : Node 22, Rust stable, et les [dépendances système Tauri](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev     # lance l'app
npm test              # tests front + script de prix
cargo test --manifest-path src-tauri/Cargo.toml
```

## Organisation

| Dossier | Rôle |
| --- | --- |
| `src/` | Interface React (en-tête snapshot, catégories, grille d'objets) |
| `src-tauri/src/ratelimit.rs` | Lecture des en-têtes de rate limit GGG |
| `src-tauri/src/pricing.rs` | Fichier de prix et rapprochement objet → prix |
| `src-tauri/src/stash.rs` | Interface `StashProvider` (POESESSID puis OAuth) |
| `scripts/fetch-prices.mjs` | Récupération horaire des prix poe.ninja |

## Prix

Le workflow `Prix poe.ninja` tourne chaque heure et publie un JSON par ligue sur la branche `prices` :
`https://raw.githubusercontent.com/ShigenoTV/poe2-stash-tracker/prices/<ligue>/latest.json`.

## Releases et mise à jour automatique

L'app vérifie au démarrage `latest.json` dans la dernière GitHub Release et propose la mise à jour.

Une seule fois : générer la clé de signature, ajouter la clé privée aux secrets du dépôt
(`TAURI_SIGNING_PRIVATE_KEY`, et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` si mot de passe),
puis mettre la clé publique dans `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/poe2-stash-tracker.key
```

Pour publier `X.Y.Z` : mettre la version dans `package.json` et `src-tauri/Cargo.toml`, committer sur `main`,
puis pousser le tag `vX.Y.Z`. Le workflow `Release` construit l'installeur Windows et publie la release.
