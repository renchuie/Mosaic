//! App data: one JSON document per name in ~/.local/share/studydesk/,
//! written atomically (temp file + rename) so a crash never leaves half a file.

use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn doc_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let ok = !name.is_empty()
        && name.len() <= 64
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !ok {
        return Err(format!("invalid document name: {name}"));
    }
    Ok(data_dir(app)?.join(format!("{name}.json")))
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(bytes).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

#[tauri::command]
pub fn load_doc(app: AppHandle, name: String) -> Result<Option<Value>, String> {
    Ok(read_json(&doc_path(&app, &name)?))
}

#[tauri::command]
pub fn save_doc(app: AppHandle, name: String, value: Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?;
    write_atomic(&doc_path(&app, &name)?, &bytes)
}
