pub mod backup;
pub mod commands;
pub mod error;
pub mod files;
pub mod gitops;
pub mod history;
pub mod projects;
pub mod settings;
pub mod spell;
pub mod state;
pub mod tex;
pub mod util;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event
                && let Some(state) = window.try_state::<state::AppState>()
            {
                *state.dropped.lock().unwrap_or_else(|p| p.into_inner()) = paths.clone();
            }
        })
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
            commands::projects::update_project_meta,
            commands::projects::duplicate_project,
            commands::projects::trash_project,
            commands::projects::forget_project,
            commands::projects::list_trashed,
            commands::projects::restore_trashed,
            commands::projects::purge_trashed,
            commands::projects::reveal_project,
            commands::files::list_tree,
            commands::files::read_text_file,
            commands::files::write_text_file,
            commands::files::create_file,
            commands::files::create_folder,
            commands::files::rename_entry,
            commands::files::move_entry,
            commands::files::duplicate_entry,
            commands::files::delete_entry,
            commands::files::upload_files_dialog,
            commands::files::watch_project,
            commands::files::unwatch_project,
            commands::files::import_dropped,
            commands::files::project_index,
            commands::export::export_pdf,
            commands::export::export_zip,
            commands::history::history_snapshot,
            commands::history::history_list,
            commands::history::history_changes,
            commands::history::history_file,
            commands::history::history_restore_file,
            commands::history::history_restore,
            commands::backup::backup_status,
            commands::backup::backup_enable,
            commands::backup::github_identity,
            commands::backup::backup_pending,
            commands::backup::backup_create,
            commands::backup::backup_list,
            commands::backup::backup_changes,
            commands::backup::backup_file,
            commands::backup::backup_restore_file,
            commands::backup::backup_restore,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::choose_projects_dir,
            commands::settings::monospace_fonts,
            commands::spell::personal_dictionary,
            commands::spell::add_to_dictionary,
            commands::spell::remove_from_dictionary,
            commands::files::search_project,
            commands::files::replace_in_project,
            commands::tex::tex_status,
            commands::compile::compile_project,
            commands::compile::cancel_compile,
            commands::compile::clean_build,
            commands::compile::open_pdf,
            commands::compile::read_pdf,
            commands::compile::reveal_pdf,
            commands::packages::package_backends,
            commands::packages::set_tex_distribution,
            commands::packages::install_managed_texlive,
            commands::packages::cancel_managed_texlive,
            commands::packages::search_packages,
            commands::packages::installed_packages,
            commands::packages::package_for_file,
            commands::packages::package_catalog_info,
            commands::packages::refresh_package_catalog,
            commands::packages::reload_package_status,
            commands::packages::package_operation,
            commands::packages::cancel_package_operation,
            commands::packages::check_package_update,
            commands::packages::open_package_docs,
            commands::synctex::synctex_forward,
            commands::synctex::synctex_inverse,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
