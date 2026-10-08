pub mod commands;
pub mod error;
pub mod projects;
pub mod state;
pub mod util;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = state::AppState::new(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::list_templates,
            commands::projects::create_project,
            commands::projects::open_folder_dialog,
            commands::projects::import_zip_dialog,
            commands::projects::set_main_file,
            commands::projects::open_project,
            commands::projects::rename_project,
            commands::projects::duplicate_project,
            commands::projects::trash_project,
            commands::projects::forget_project,
            commands::projects::reveal_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
