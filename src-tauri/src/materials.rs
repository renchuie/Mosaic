//! Materials (Study → Materials): the folder that holds everything she makes with AI
//! (recall labs now; quizzes and other materials later). It is the old labs folder under a
//! new name, so scanning and serving stay in labs.rs; this module adds:
//!
//! - `paths_info`: does a folder exist, and does it carry the Materials marker file.
//! - `materials_adopt`: one-time move of the old "Recall Labs" folder's contents into
//!   Materials. Paths inside stay the same, so progress (keyed by lab slug) and folder links
//!   (keyed by path relative to the folder) carry over. A marker file records the move so
//!   the other computer can switch over by itself.
//! - `materials_write`: save an uploaded file under the Materials folder (never outside it,
//!   never over an existing file unless asked).

use crate::labs::{expand_home, resolve, LabsState};
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::State;

pub const MARKER: &str = ".mosaic-materials";
const ALLOWED: &[&str] = &["html", "htm", "md", "txt", "json"];

#[derive(Serialize)]
pub struct PathInfo {
    pub path: String,
    pub dir: bool,
    pub marker: bool,
}

#[tauri::command]
pub async fn paths_info(paths: Vec<String>) -> Vec<PathInfo> {
    paths
        .into_iter()
        .map(|p| {
            let full = expand_home(&p);
            PathInfo { dir: full.is_dir(), marker: full.join(MARKER).is_file(), path: p }
        })
        .collect()
}

#[derive(Serialize, Debug)]
pub struct AdoptResult {
    pub moved: u32,
    /// names left behind because Materials already had something with that name
    pub skipped: Vec<String>,
}

fn adopt(from: &Path, to: &Path) -> Result<AdoptResult, String> {
    if !from.is_dir() {
        return Err(format!("{} isn't there", from.display()));
    }
    let parent = to.parent().ok_or("Bad Materials path")?;
    if !parent.is_dir() {
        return Err(format!("{} isn't there. Is Google Drive mounted?", parent.display()));
    }
    let mut res = AdoptResult { moved: 0, skipped: vec![] };
    if !to.exists() {
        // simplest case: rename the whole folder
        fs::rename(from, to).map_err(|e| format!("Could not move the folder: {e}"))?;
        res.moved = fs::read_dir(to).map(|r| r.count() as u32).unwrap_or(0);
    } else {
        for e in fs::read_dir(from).map_err(|e| e.to_string())?.flatten() {
            let name = e.file_name();
            let target = to.join(&name);
            if target.exists() {
                res.skipped.push(name.to_string_lossy().into_owned());
                continue;
            }
            fs::rename(e.path(), &target).map_err(|e| format!("Could not move {}: {e}", name.to_string_lossy()))?;
            res.moved += 1;
        }
        // remove the old folder only if nothing was left behind
        if res.skipped.is_empty() {
            let _ = fs::remove_dir(from);
        }
    }
    let from_name = from.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let marker = format!("{{\"movedFrom\":{:?},\"at\":{}}}\n", from_name, stamp);
    fs::write(to.join(MARKER), marker).map_err(|e| e.to_string())?;
    Ok(res)
}

#[tauri::command]
pub async fn materials_adopt(from: String, to: String) -> Result<AdoptResult, String> {
    adopt(&expand_home(&from), &expand_home(&to))
}

fn write_atomic(p: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = p.with_file_name(format!(".{name}.tmp"));
    {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(bytes).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, p).map_err(|e| e.to_string())
}

fn check_write(root: &Path, rel: &str, exists_ok: bool) -> Result<std::path::PathBuf, String> {
    if !root.is_dir() {
        return Err(format!("{} isn't there. Is Google Drive mounted?", root.display()));
    }
    let ext = Path::new(rel).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !ALLOWED.contains(&ext.as_str()) {
        return Err(format!("Mosaic only saves {} files here", ALLOWED.join(", ")));
    }
    let p = resolve(root, rel).ok_or("Invalid path")?;
    if p == root {
        return Err("Invalid path".into());
    }
    if p.exists() && !exists_ok {
        return Err("exists".into());
    }
    Ok(p)
}

/// Save an uploaded material at `rel` (relative to the Materials folder). Refuses with
/// "exists" if something is already there, unless `replace` is true.
#[tauri::command]
pub async fn materials_write(state: State<'_, LabsState>, rel: String, content: String, replace: Option<bool>) -> Result<(), String> {
    let root = state.root.lock().unwrap().clone().ok_or("Materials folder not scanned yet")?;
    let p = check_write(&root, &rel, replace.unwrap_or(false))?;
    tauri::async_runtime::spawn_blocking(move || write_atomic(&p, content.as_bytes()))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("sd-mat-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn adopt_renames_when_materials_missing() {
        let d = tmp("a");
        fs::create_dir_all(d.join("Recall Labs/Ther IV/Exam 5")).unwrap();
        fs::write(d.join("Recall Labs/Ther IV/Exam 5/lab.html"), "x").unwrap();
        let r = adopt(&d.join("Recall Labs"), &d.join("Materials")).unwrap();
        assert!(d.join("Materials/Ther IV/Exam 5/lab.html").is_file());
        assert!(!d.join("Recall Labs").exists());
        assert!(d.join("Materials").join(MARKER).is_file());
        assert_eq!(r.skipped.len(), 0);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn adopt_merges_and_skips_clashes() {
        let d = tmp("b");
        fs::create_dir_all(d.join("Recall Labs/Law")).unwrap();
        fs::create_dir_all(d.join("Recall Labs/PGx")).unwrap();
        fs::create_dir_all(d.join("Materials/Law")).unwrap();
        let r = adopt(&d.join("Recall Labs"), &d.join("Materials")).unwrap();
        assert_eq!(r.moved, 1);
        assert_eq!(r.skipped, vec!["Law".to_string()]);
        assert!(d.join("Materials/PGx").is_dir());
        assert!(d.join("Recall Labs/Law").is_dir()); // left alone
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn adopt_refuses_unmounted_parent() {
        let d = tmp("c");
        fs::create_dir_all(d.join("Recall Labs")).unwrap();
        assert!(adopt(&d.join("Recall Labs"), &d.join("missing/Materials")).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn write_checks() {
        let d = tmp("d");
        assert!(check_write(&d, "Ther IV/lab.html", false).is_ok());
        assert!(check_write(&d, "../escape.html", false).is_err());
        assert!(check_write(&d, "evil.sh", false).is_err());
        fs::write(d.join("a.html"), "x").unwrap();
        assert_eq!(check_write(&d, "a.html", false).unwrap_err(), "exists");
        assert!(check_write(&d, "a.html", true).is_ok());
        assert!(check_write(&d.join("nope"), "a.html", false).is_err());
        let _ = fs::remove_dir_all(&d);
    }
}
