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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
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
            export::export_csv
        ]);

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
