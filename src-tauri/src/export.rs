//! Export du snapshot affiché en CSV, dans le dossier Téléchargements.

use tauri::Manager;

/// Écrit `contents` dans `file_name` (Téléchargements, sinon Documents) ; renvoie le chemin.
#[tauri::command]
pub async fn export_csv(app: tauri::AppHandle, file_name: String, contents: String) -> Result<String, String> {
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|e| e.to_string())?;
    let safe: String = file_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '_' })
        .collect();
    let path = dir.join(if safe.ends_with(".csv") { safe } else { format!("{safe}.csv") });
    // BOM UTF-8 : Excel affiche alors correctement les accents.
    let mut bytes = "\u{feff}".as_bytes().to_vec();
    bytes.extend_from_slice(contents.as_bytes());
    tokio::fs::write(&path, bytes).await.map_err(|e| format!("Export impossible : {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}
