//! Historique du net worth, enregistré dans `history.json` du dossier de données.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::Manager;
use tokio::sync::Mutex;

/// Deux points plus proches que ça sont fusionnés (le scan automatique en produit beaucoup).
const MERGE_WINDOW_MS: i64 = 5 * 60 * 1000;
/// Au-delà de cet âge, on ne garde qu'un point par heure et par ligue (le dernier de l'heure) :
/// le fichier reste léger sur une longue ligue, maintenant que chaque point détaille les objets.
const DETAIL_KEPT_MS: i64 = 24 * 3600 * 1000;
const HOUR_MS: i64 = 3600 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPoint {
    /// Horodatage en millisecondes depuis l'epoch.
    pub at: i64,
    pub league: String,
    pub divine: f64,
    pub exalted: f64,
    /// Absent des points enregistrés avant l'affichage en Chaos.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chaos: Option<f64>,
    /// Quantité de chaque objet identifié, pour comparer deux moments (absent des anciens points).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<BTreeMap<String, u32>>,
}

#[derive(Default)]
pub struct HistoryState(Mutex<()>);

/// Ajoute un point, ou remplace le dernier s'il est récent et de la même ligue.
pub fn push(points: &mut Vec<HistoryPoint>, point: HistoryPoint) {
    let now = point.at;
    match points.last_mut() {
        Some(last) if last.league == point.league && point.at - last.at < MERGE_WINDOW_MS && point.at >= last.at => {
            *last = point
        }
        _ => points.push(point),
    }
    compact(points, now);
}

/// Points de plus de 24 h : un seul par heure et par ligue, le plus récent de l'heure.
pub fn compact(points: &mut Vec<HistoryPoint>, now: i64) {
    let old = |p: &HistoryPoint| now - p.at > DETAIL_KEPT_MS;
    let mut keep = vec![true; points.len()];
    for i in 0..points.len() {
        if !old(&points[i]) {
            continue;
        }
        let hour = points[i].at.div_euclid(HOUR_MS);
        // Un point plus récent de la même heure et de la même ligue le remplace.
        keep[i] = !points[i + 1..]
            .iter()
            .any(|q| old(q) && q.league == points[i].league && q.at.div_euclid(HOUR_MS) == hour);
    }
    let mut flags = keep.into_iter();
    points.retain(|_| flags.next().unwrap_or(true));
}

fn path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("history.json"))
}

async fn read(app: &tauri::AppHandle) -> Result<Vec<HistoryPoint>, String> {
    match tokio::fs::read(path(app)?).await {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn load_history(app: tauri::AppHandle, state: tauri::State<'_, HistoryState>) -> Result<Vec<HistoryPoint>, String> {
    let _guard = state.0.lock().await;
    read(&app).await
}

/// Efface l'historique d'une ligue, ou tout l'historique sans ligue.
#[tauri::command]
pub async fn clear_history(
    app: tauri::AppHandle,
    state: tauri::State<'_, HistoryState>,
    league: Option<String>,
) -> Result<Vec<HistoryPoint>, String> {
    let _guard = state.0.lock().await;
    let mut points = read(&app).await?;
    match league {
        Some(l) => points.retain(|p| p.league != l),
        None => points.clear(),
    }
    write(&app, &points).await?;
    Ok(points)
}

async fn write(app: &tauri::AppHandle, points: &[HistoryPoint]) -> Result<(), String> {
    let file = path(app)?;
    if let Some(dir) = file.parent() {
        tokio::fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    }
    // Écriture atomique : fichier temporaire puis renommage.
    let tmp = file.with_extension("json.tmp");
    tokio::fs::write(&tmp, serde_json::to_vec(points).map_err(|e| e.to_string())?)
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::rename(&tmp, &file).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn record_history(
    app: tauri::AppHandle,
    state: tauri::State<'_, HistoryState>,
    point: HistoryPoint,
) -> Result<Vec<HistoryPoint>, String> {
    let _guard = state.0.lock().await;
    let mut points = read(&app).await?;
    push(&mut points, point);
    write(&app, &points).await?;
    Ok(points)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(at: i64, league: &str, divine: f64) -> HistoryPoint {
        HistoryPoint { at, league: league.into(), divine, exalted: divine * 400.0, chaos: None, items: None }
    }

    #[test]
    fn merges_close_points_of_same_league() {
        let mut points = vec![p(0, "A", 1.0)];
        push(&mut points, p(60_000, "A", 2.0));
        assert_eq!(points, vec![p(60_000, "A", 2.0)]);
        push(&mut points, p(60_000 + MERGE_WINDOW_MS, "A", 3.0));
        push(&mut points, p(60_000 + MERGE_WINDOW_MS + 1, "B", 4.0));
        assert_eq!(points.len(), 3);
    }

    #[test]
    fn keeps_one_point_per_hour_after_a_day() {
        let min = 60_000;
        // Une heure complète il y a deux jours (6 points), et 6 points récents.
        let start = 10 * HOUR_MS;
        let mut points: Vec<HistoryPoint> = (0..6).map(|i| p(start + i * 10 * min, "A", i as f64)).collect();
        points.push(p(start + 5, "B", 9.0));
        let now = start + 2 * DETAIL_KEPT_MS;
        points.extend((0..6).map(|i| p(now - 60 * min + i * 10 * min, "A", 10.0 + i as f64)));
        compact(&mut points, now);
        let old: Vec<(String, f64)> =
            points.iter().filter(|q| q.at < now - DETAIL_KEPT_MS).map(|q| (q.league.clone(), q.divine)).collect();
        // Le dernier point de l'heure pour chaque ligue ; les points récents restent tous.
        assert_eq!(old, vec![("A".into(), 5.0), ("B".into(), 9.0)]);
        assert_eq!(points.len(), 8);
    }
}
