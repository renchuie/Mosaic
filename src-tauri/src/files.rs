//! File management for Study → Files (Nov 20): move / rename, new folder, duplicate, delete (to
//! `.trash/`, restorable like notes) and show in the file manager, for the PDF folder ("pdf"), the
//! Materials folder ("mat") and the notes folder ("note", reveal only: notes have their own
//! commands). Never overwrites; never touches anything outside the chosen folder.
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

use crate::labs::{resolve, LabsState};
use crate::notes::{trash_into, NotesState};
use crate::pdfs::PdfsState;

const ORIGINALS: &str = ".studydesk-originals";

fn root(area: &str, l: &State<'_, LabsState>, p: &State<'_, PdfsState>, n: &State<'_, NotesState>) -> Result<PathBuf, String> {
    let r = match area {
        "pdf" => p.root.lock().unwrap().clone(),
        "mat" => l.root.lock().unwrap().clone(),
        "note" => n.root.lock().unwrap().clone(),
        _ => return Err("Unknown folder".into()),
    };
    let r = r.ok_or("That folder isn't loaded yet")?;
    if !r.is_dir() {
        return Err("That folder isn't there. Is your synced folder connected?".into());
    }
    Ok(r)
}
fn inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = resolve(root, rel).ok_or("Invalid path")?;
    if p == root || rel.split('/').any(|c| c.starts_with('.')) {
        return Err("Invalid path".into());
    }
    Ok(p)
}

/// Rename or move a file or folder. Never overwrites. A PDF's untouched original moves with it.
#[tauri::command]
pub async fn files_move(area: String, from: String, to: String, l: State<'_, LabsState>, p: State<'_, PdfsState>, n: State<'_, NotesState>) -> Result<(), String> {
    let r = root(&area, &l, &p, &n)?;
    let a = inside(&r, &from)?;
    let b = inside(&r, &to)?;
    if b.starts_with(&a) {
        return Err("A folder can't go inside itself".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        if !a.exists() {
            return Err(format!("“{from}” isn't there any more"));
        }
        if b.exists() {
            return Err(format!("“{to}” already exists"));
        }
        if let Some(dir) = b.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        fs::rename(&a, &b).map_err(|e| e.to_string())?;
        if area == "pdf" {
            let (oa, ob) = (r.join(ORIGINALS).join(&from), r.join(ORIGINALS).join(&to));
            if oa.exists() && !ob.exists() {
                if let Some(dir) = ob.parent() {
                    let _ = fs::create_dir_all(dir);
                }
                let _ = fs::rename(oa, ob);
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn files_mkdir(area: String, rel: String, l: State<'_, LabsState>, p: State<'_, PdfsState>, n: State<'_, NotesState>) -> Result<(), String> {
    let r = root(&area, &l, &p, &n)?;
    let d = inside(&r, &rel)?;
    if d.exists() {
        return Err(format!("“{rel}” already exists"));
    }
    fs::create_dir_all(d).map_err(|e| e.to_string())
}

/// Copy a file next to itself (or anywhere in the same folder tree). Never overwrites.
#[tauri::command]
pub async fn files_copy(area: String, from: String, to: String, l: State<'_, LabsState>, p: State<'_, PdfsState>, n: State<'_, NotesState>) -> Result<(), String> {
    let r = root(&area, &l, &p, &n)?;
    let a = inside(&r, &from)?;
    let b = inside(&r, &to)?;
    tauri::async_runtime::spawn_blocking(move || {
        if !a.is_file() {
            return Err("Only files can be duplicated".to_string());
        }
        if b.exists() {
            return Err(format!("“{to}” already exists"));
        }
        fs::copy(&a, &b).map(|_| ()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Move a file or folder into `<folder>/.trash/` (with where it came from).
#[tauri::command]
pub async fn files_trash(area: String, rel: String, l: State<'_, LabsState>, p: State<'_, PdfsState>, n: State<'_, NotesState>) -> Result<(), String> {
    let r = root(&area, &l, &p, &n)?;
    let a = inside(&r, &rel)?;
    tauri::async_runtime::spawn_blocking(move || trash_into(&r, &a, &rel)).await.map_err(|e| e.to_string())?
}

/// Show a file's folder (or a folder) in the system file manager.
#[tauri::command]
pub async fn files_reveal(area: String, rel: String, l: State<'_, LabsState>, p: State<'_, PdfsState>, n: State<'_, NotesState>) -> Result<(), String> {
    let r = root(&area, &l, &p, &n)?;
    let t = if rel.is_empty() { r.clone() } else { inside(&r, &rel)? };
    let dir = if t.is_dir() { t } else { t.parent().map(Path::to_path_buf).unwrap_or(r) };
    let cmd = if cfg!(windows) { "explorer" } else if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    std::process::Command::new(cmd).arg(&dir).spawn().map(|_| ()).map_err(|e| format!("Could not open the folder: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inside_refuses_escapes_and_hidden() {
        let r = Path::new("/tmp/root");
        assert!(inside(r, "../x").is_err());
        assert!(inside(r, ".trash/x").is_err());
        assert!(inside(r, "").is_err());
        assert_eq!(inside(r, "a/b.pdf").unwrap(), Path::new("/tmp/root/a/b.pdf"));
    }
}
