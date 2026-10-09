mod capture;
mod history;
mod icons;
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
        .manage(scan::LastCapture::default())
        .manage(library::LibraryState::default())
        .manage(scan::AutoScanState::default())
        .manage(history::HistoryState::default())
        .invoke_handler(tauri::generate_handler![
            scan::capture_game,
            scan::scan_region,
            scan::auto_scan,
            scan::reset_auto_scan,
            library::get_prices,
            library::label_slot,
            history::load_history,
            history::record_history
        ]);

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
