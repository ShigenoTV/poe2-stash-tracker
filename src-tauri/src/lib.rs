mod capture;
mod export;
mod history;
pub mod icons;
mod library;
mod pricing;
mod ratelimit;
mod scan;
pub mod vision;
mod stash;
pub mod stashtype;
#[cfg(desktop)]
mod tabname;
mod tray;

/// Sans zone de notification (mobile), l'infobulle n'existe pas.
#[tauri::command]
fn set_tray_tooltip(app: tauri::AppHandle, text: String) -> Result<(), String> {
    #[cfg(desktop)]
    return tray::set_tray_tooltip(app, text);
    #[cfg(not(desktop))]
    {
        let _ = (app, text);
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // Une seule instance : relancer l'app (raccourci, menu Démarrer) rouvre la fenêtre existante,
    // rangée dans la zone de notification, au lieu de lancer un second scan.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)));
    }
    builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(library::LibraryState::default())
        .manage(scan::AutoScanState::default())
        .manage(history::HistoryState::default())
        .invoke_handler(tauri::generate_handler![
            scan::auto_scan,
            scan::reset_auto_scan,
            library::get_prices,
            library::refresh_prices,
            library::list_leagues,
            library::set_league,
            library::forget_labels,
            library::label_slot,
            history::load_history,
            history::record_history,
            history::clear_history,
            export::export_csv,
            set_tray_tooltip
        ]);

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec![tray::MINIMIZED_ARG]),
            ))
            .setup(|app| {
                tray::create(app.handle())?;
                if !std::env::args().any(|a| a == tray::MINIMIZED_ARG) {
                    tray::show_main(app.handle());
                }
                Ok(())
            })
            // Fermer la fenêtre la range dans la zone de notification : le scan continue.
            .on_window_event(|window, event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if window.label() == "main" {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            });
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
