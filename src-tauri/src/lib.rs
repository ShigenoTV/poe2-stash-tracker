mod capture;
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
        .invoke_handler(tauri::generate_handler![
            scan::capture_game,
            scan::scan_region,
            library::get_prices,
            library::label_slot
        ]);

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
