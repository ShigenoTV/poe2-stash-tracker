//! Prix et références d'icônes : téléchargement, cache disque et cases identifiées par le joueur.

use crate::icons::{self, Candidate, Descriptor};
use crate::pricing::PriceFile;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::Manager;
use tokio::sync::Mutex;

const PRICES_BASE: &str = "https://raw.githubusercontent.com/ShigenoTV/poe2-stash-tracker/prices";
const USER_AGENT: &str = concat!("poe2-stash-tracker/", env!("CARGO_PKG_VERSION"));
/// En dessous, une case mémorisée est considérée comme le même objet.
const MEMORY_MATCH: f32 = 0.06;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueEntry {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub fetched_at: String,
    pub count: u32,
}

#[derive(Deserialize)]
struct LeagueIndex {
    leagues: Vec<LeagueEntry>,
}

/// Case identifiée (ou corrigée) par le joueur.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Labeled {
    pub item_id: String,
    pub descriptor: Descriptor,
}

/// Réglages persistants.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct Settings {
    /// Ligue choisie ; `None` = la première du fichier de prix (ligue en cours).
    league: Option<String>,
}

#[derive(Default)]
pub struct Library {
    pub prices: Option<PriceFile>,
    settings: Option<Settings>,
    references: Vec<(String, Descriptor)>,
    memory: Option<Vec<Labeled>>,
}

#[derive(Default)]
pub struct LibraryState(pub Mutex<Library>);

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MatchSource {
    Memory,
    Ninja,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Identification {
    pub source: MatchSource,
    pub candidates: Vec<Candidate>,
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().user_agent(USER_AGENT).build().map_err(|e| e.to_string())
}

async fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let bytes = tokio::fs::read(path).await.ok()?;
    serde_json::from_slice(&bytes).ok()
}

async fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::write(path, bytes).await.map_err(|e| e.to_string())
}

/// Télécharge le fichier de prix de la ligue (la ligue en cours par défaut).
/// Hors ligne, retombe sur la dernière copie enregistrée.
async fn fetch_prices(app: &tauri::AppHandle, league: Option<&str>) -> Result<PriceFile, String> {
    let cache = data_dir(app)?.join("prices");
    let http = client()?;
    let online: Result<PriceFile, String> = async {
        let index: LeagueIndex = http
            .get(format!("{PRICES_BASE}/leagues.json"))
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        let entry = match league {
            Some(id) => index.leagues.iter().find(|l| l.id == id),
            None => index.leagues.first(),
        }
        .ok_or("Ligue inconnue dans le fichier de prix")?;
        let bytes = http
            .get(format!("{PRICES_BASE}/{}/latest.json", entry.slug))
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;
        let file: PriceFile = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        write_bytes(&cache.join("last.json"), &bytes).await?;
        Ok(file)
    }
    .await;
    match online {
        Ok(file) => Ok(file),
        // La copie hors ligne ne sert que si c'est la bonne ligue.
        Err(err) => read_json::<PriceFile>(&cache.join("last.json"))
            .await
            .filter(|f| league.is_none_or(|id| f.league == id))
            .ok_or(format!("Prix indisponibles : {err}")),
    }
}

/// Icône de poe.ninja, mise en cache disque sous le hash de son URL.
async fn icon_descriptor(http: &reqwest::Client, dir: &Path, url: &str) -> Option<Descriptor> {
    let name = format!("{:x}.png", Sha256::digest(url.as_bytes()));
    let path = dir.join(name);
    let bytes = match tokio::fs::read(&path).await {
        Ok(b) => b,
        Err(_) => {
            let b = http.get(url).send().await.ok()?.error_for_status().ok()?.bytes().await.ok()?.to_vec();
            write_bytes(&path, &b).await.ok()?;
            b
        }
    };
    let img = image::load_from_memory(&bytes).ok()?.to_rgba8();
    Some(icons::describe_reference(&img))
}

/// Les gemmes de lignée ne s'empilent pas et n'ont pas d'onglet dédié : elles ne peuvent pas
/// apparaître dans les onglets scannés, et leurs icônes provoquaient de faux positifs coûteux.
fn stackable(category: &str) -> bool {
    category != "LineageSupportGems"
}

async fn build_references(app: &tauri::AppHandle, prices: &PriceFile) -> Result<Vec<(String, Descriptor)>, String> {
    let dir = data_dir(app)?.join("icons");
    let http = client()?;
    let mut refs = Vec::new();
    // Par paquets de 8 : rapide sans marteler le CDN.
    let items: Vec<_> = prices
        .items
        .iter()
        .filter(|i| stackable(&i.category))
        .filter_map(|i| i.icon.as_ref().map(|u| (i.id.clone(), u.clone())))
        .collect();
    for chunk in items.chunks(8) {
        let found = futures_util::future::join_all(
            chunk.iter().map(|(id, url)| {
                let (http, dir) = (&http, &dir);
                async move { icon_descriptor(http, dir, url).await.map(|d| (id.clone(), d)) }
            }),
        )
        .await;
        refs.extend(found.into_iter().flatten());
    }
    Ok(refs)
}

impl Library {
    /// Charge prix, icônes et mémoire si ce n'est pas déjà fait.
    pub async fn ensure_loaded(&mut self, app: &tauri::AppHandle) -> Result<(), String> {
        if self.memory.is_none() {
            let path = data_dir(app)?.join("labels.json");
            self.memory = Some(read_json(&path).await.unwrap_or_default());
        }
        if self.settings.is_none() {
            self.settings = Some(read_json(&data_dir(app)?.join("settings.json")).await.unwrap_or_default());
        }
        if self.prices.is_none() {
            let league = self.settings.as_ref().and_then(|s| s.league.clone());
            let prices = fetch_prices(app, league.as_deref()).await?;
            self.references = build_references(app, &prices).await?;
            self.prices = Some(prices);
        }
        Ok(())
    }

    pub fn identify(&self, slot: &Descriptor) -> Identification {
        let memory = self.memory.as_deref().unwrap_or_default();
        let remembered = icons::rank(slot, memory.iter().map(|l| (l.item_id.as_str(), &l.descriptor)), false, 1);
        if remembered.first().is_some_and(|c| c.distance <= MEMORY_MATCH) {
            return Identification { source: MatchSource::Memory, candidates: remembered };
        }
        let candidates = icons::rank(slot, self.references.iter().map(|(id, d)| (id.as_str(), d)), true, 5);
        Identification { source: MatchSource::Ninja, candidates }
    }

    pub async fn remember(&mut self, app: &tauri::AppHandle, item_id: String, descriptor: Descriptor) -> Result<(), String> {
        let memory = self.memory.get_or_insert_with(Vec::new);
        // Une correction remplace l'ancienne étiquette de la même case.
        memory.retain(|l| icons::distance(&l.descriptor, &descriptor, false) > MEMORY_MATCH);
        memory.push(Labeled { item_id, descriptor });
        let json = serde_json::to_vec(memory).map_err(|e| e.to_string())?;
        write_bytes(&data_dir(app)?.join("labels.json"), &json).await
    }
}

#[tauri::command]
pub async fn get_prices(app: tauri::AppHandle, state: tauri::State<'_, LibraryState>) -> Result<PriceFile, String> {
    let mut lib = state.0.lock().await;
    lib.ensure_loaded(&app).await?;
    Ok(lib.prices.clone().expect("chargé juste au-dessus"))
}

/// Retélécharge le fichier de prix (publié toutes les heures depuis poe.ninja).
#[tauri::command]
pub async fn refresh_prices(app: tauri::AppHandle, state: tauri::State<'_, LibraryState>) -> Result<PriceFile, String> {
    let mut lib = state.0.lock().await;
    lib.prices = None;
    lib.ensure_loaded(&app).await?;
    Ok(lib.prices.clone().expect("chargé juste au-dessus"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Leagues {
    pub leagues: Vec<LeagueEntry>,
    /// Ligue choisie dans les réglages, `None` = ligue en cours.
    pub selected: Option<String>,
}

#[tauri::command]
pub async fn list_leagues(app: tauri::AppHandle, state: tauri::State<'_, LibraryState>) -> Result<Leagues, String> {
    let index: LeagueIndex = client()?
        .get(format!("{PRICES_BASE}/leagues.json"))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let mut lib = state.0.lock().await;
    if lib.settings.is_none() {
        lib.settings = Some(read_json(&data_dir(&app)?.join("settings.json")).await.unwrap_or_default());
    }
    Ok(Leagues { leagues: index.leagues, selected: lib.settings.as_ref().and_then(|s| s.league.clone()) })
}

/// Change de ligue, l'enregistre et recharge ses prix.
#[tauri::command]
pub async fn set_league(
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryState>,
    league: Option<String>,
) -> Result<PriceFile, String> {
    let mut lib = state.0.lock().await;
    let settings = Settings { league };
    write_bytes(&data_dir(&app)?.join("settings.json"), &serde_json::to_vec(&settings).map_err(|e| e.to_string())?).await?;
    lib.settings = Some(settings);
    lib.prices = None;
    lib.ensure_loaded(&app).await?;
    Ok(lib.prices.clone().expect("chargé juste au-dessus"))
}

/// Oublie toutes les cases corrigées par le joueur.
#[tauri::command]
pub async fn forget_labels(app: tauri::AppHandle, state: tauri::State<'_, LibraryState>) -> Result<(), String> {
    let mut lib = state.0.lock().await;
    lib.memory = Some(Vec::new());
    write_bytes(&data_dir(&app)?.join("labels.json"), b"[]").await
}

#[tauri::command]
pub async fn label_slot(
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryState>,
    descriptor: String,
    item_id: String,
) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(descriptor).map_err(|e| e.to_string())?;
    state.0.lock().await.remember(&app, item_id, Descriptor(bytes)).await
}
