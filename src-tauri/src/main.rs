// Study Desk: Tauri shell. Modules: store (JSON app data), labs (scanner + /__labs/ files).

mod labs;
mod store;

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
            debug_route,
            debug_log,
            debug_quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Study Desk");
}
