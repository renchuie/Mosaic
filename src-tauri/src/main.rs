// Mosaic (internal id studydesk): Tauri shell. Modules: store (local JSON app data), labs (scanner + /__labs/ files),
// sync (per-machine files in a Google Drive folder), notes, pdfs.

mod labs;
mod materials;
mod notes;
mod pdfs;
mod store;
mod sync;

/// Lets a test run start on a given page (STUDYDESK_ROUTE=labs) and print checks to stdout.
#[tauri::command]
fn debug_route() -> Option<String> {
    std::env::var("STUDYDESK_ROUTE").ok()
}

#[tauri::command]
fn debug_log(msg: String) {
    println!("[studydesk] {msg}");
}

/// Ends a test run the same way closing the window does.
#[tauri::command]
fn debug_quit(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .manage(labs::LabsState::default())
        .manage(notes::NotesState::default())
        .manage(pdfs::PdfsState::default())
        .setup(|app| {
            // The main window is built here (not from config alone) so labs can be
            // served on the app's own origin.
            let handle = app.handle().clone();
            let config = app.config().app.windows[0].clone();
            tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                .on_web_resource_request(move |request, response| labs::serve(&handle, &request, response))
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            store::load_doc,
            store::save_doc,
            labs::scan_labs,
            labs::open_in_system,
            materials::paths_info,
            materials::materials_adopt,
            materials::materials_write,
            sync::machine_name,
            notes::notes_list,
            notes::notes_read,
            notes::notes_write,
            notes::notes_write_file,
            notes::notes_mkdir,
            notes::notes_move,
            notes::notes_trash,
            pdfs::pdfs_list,
            pdfs::pdfs_stat,
            pdfs::pdfs_write,
            pdfs::pdfs_restore,
            pdfs::pdfs_open,
            sync::sync_write,
            sync::sync_read,
            debug_route,
            debug_log,
            debug_quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mosaic");
}
