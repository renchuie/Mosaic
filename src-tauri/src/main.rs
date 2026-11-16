// Study Desk: app shell. Storage, the labs scanner and Google Calendar
// arrive as modules in later phases.

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Study Desk");
}
