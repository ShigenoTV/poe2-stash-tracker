//! Historique du net worth, enregistré dans `history.json` du dossier de données.

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tokio::sync::Mutex;

/// Deux points plus proches que ça sont fusionnés (le scan automatique en produit beaucoup).
const MERGE_WINDOW_MS: i64 = 5 * 60 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPoint {
    /// Horodatage en millisecondes depuis l'epoch.
    pub at: i64,
    pub league: String,
    pub divine: f64,
    pub exalted: f64,
}

#[derive(Default)]
pub struct HistoryState(Mutex<()>);

/// Ajoute un point, ou remplace le dernier s'il est récent et de la même ligue.
pub fn push(points: &mut Vec<HistoryPoint>, point: HistoryPoint) {
    match points.last_mut() {
        Some(last) if last.league == point.league && point.at - last.at < MERGE_WINDOW_MS && point.at >= last.at => {
            *last = point
        }
        _ => points.push(point),
    }
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

#[tauri::command]
pub async fn record_history(
    app: tauri::AppHandle,
    state: tauri::State<'_, HistoryState>,
    point: HistoryPoint,
) -> Result<Vec<HistoryPoint>, String> {
    let _guard = state.0.lock().await;
    let mut points = read(&app).await?;
    push(&mut points, point);
    let file = path(&app)?;
    if let Some(dir) = file.parent() {
        tokio::fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    }
    // Écriture atomique : fichier temporaire puis renommage.
    let tmp = file.with_extension("json.tmp");
    tokio::fs::write(&tmp, serde_json::to_vec(&points).map_err(|e| e.to_string())?)
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::rename(&tmp, &file).await.map_err(|e| e.to_string())?;
    Ok(points)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(at: i64, league: &str, divine: f64) -> HistoryPoint {
        HistoryPoint { at, league: league.into(), divine, exalted: divine * 400.0 }
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
}
