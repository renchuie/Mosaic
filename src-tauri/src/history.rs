//! Per-note version history (Nov 19, her ask after comparing with Obsidian's File recovery).
//! Kept on this computer in <app data>/history/<key>/, where key = a hash of the note's path:
//! `path.txt` holds the note's current path and each version is `<ms>.md` (the note's text as it
//! was just before a save). The frontend decides when to take one (stores/notes.svelte.ts).
//! Renames and moves carry the folder along (`history_move`), so a note keeps its history.

use crate::store::data_dir;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

fn key(rel: &str) -> String {
    // FNV-1a, 64 bit: stable across runs and platforms
    let mut h: u64 = 0xcbf29ce484222325;
    for b in rel.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let d = data_dir(app)?.join("history");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Serialize, Debug)]
pub struct Version {
    pub t: u64,
    pub size: u64,
}

fn versions(dir: &Path) -> Vec<Version> {
    let mut out: Vec<Version> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            let t = n.strip_suffix(".md")?.parse::<u64>().ok()?;
            Some(Version { t, size: e.metadata().map(|m| m.len()).unwrap_or(0) })
        })
        .collect();
    out.sort_by(|a, b| b.t.cmp(&a.t));
    out
}

/// Save one version; then drop versions older than `keep_days` and beyond `max` (newest kept).
pub fn add(base: &Path, rel: &str, text: &str, keep_days: u64, max: usize) -> Result<(), String> {
    let dir = base.join(key(rel));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("path.txt"), rel).map_err(|e| e.to_string())?;
    let t = now_ms();
    // the same text as the newest version: nothing new to keep
    if let Some(v) = versions(&dir).first() {
        if fs::read_to_string(dir.join(format!("{}.md", v.t))).ok().as_deref() == Some(text) {
            return Ok(());
        }
    }
    crate::store::write_atomic(&dir.join(format!("{t}.md")), text.as_bytes())?;
    let cutoff = t.saturating_sub(keep_days.max(1) * 86_400_000);
    for (i, v) in versions(&dir).into_iter().enumerate() {
        if i >= max.max(1) || v.t < cutoff {
            let _ = fs::remove_file(dir.join(format!("{}.md", v.t)));
        }
    }
    Ok(())
}

pub fn list(base: &Path, rel: &str) -> Vec<Version> {
    versions(&base.join(key(rel)))
}

pub fn get(base: &Path, rel: &str, t: u64) -> Result<String, String> {
    fs::read_to_string(base.join(key(rel)).join(format!("{t}.md"))).map_err(|e| e.to_string())
}

/// A note (or with `folder`, every note under a folder) moved from `from` to `to`.
pub fn mv(base: &Path, from: &str, to: &str, folder: bool) -> Result<(), String> {
    let mut moves: Vec<(String, String)> = vec![];
    for e in fs::read_dir(base).map_err(|e| e.to_string())?.flatten() {
        let Ok(rel) = fs::read_to_string(e.path().join("path.txt")) else { continue };
        let next = if rel == from {
            Some(to.to_string())
        } else if folder && rel.starts_with(&format!("{from}/")) {
            Some(format!("{to}{}", &rel[from.len()..]))
        } else {
            None
        };
        if let Some(n) = next {
            moves.push((rel, n));
        }
    }
    for (a, b) in moves {
        let src = base.join(key(&a));
        let dst = base.join(key(&b));
        fs::create_dir_all(&dst).map_err(|e| e.to_string())?;
        for f in fs::read_dir(&src).map_err(|e| e.to_string())?.flatten() {
            let name = f.file_name();
            if name != "path.txt" {
                let _ = fs::rename(f.path(), dst.join(&name));
            }
        }
        fs::write(dst.join("path.txt"), &b).map_err(|e| e.to_string())?;
        let _ = fs::remove_dir_all(&src);
    }
    Ok(())
}

#[tauri::command]
pub async fn history_add(app: AppHandle, rel: String, text: String, keep_days: u64, max: usize) -> Result<(), String> {
    let base = root(&app)?;
    tauri::async_runtime::spawn_blocking(move || add(&base, &rel, &text, keep_days, max)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn history_list(app: AppHandle, rel: String) -> Result<Vec<Version>, String> {
    let base = root(&app)?;
    tauri::async_runtime::spawn_blocking(move || Ok(list(&base, &rel))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn history_get(app: AppHandle, rel: String, t: u64) -> Result<String, String> {
    let base = root(&app)?;
    tauri::async_runtime::spawn_blocking(move || get(&base, &rel, t)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn history_move(app: AppHandle, from: String, to: String, folder: bool) -> Result<(), String> {
    let base = root(&app)?;
    tauri::async_runtime::spawn_blocking(move || mv(&base, &from, &to, folder)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_list_get_move() {
        let base = std::env::temp_dir().join(format!("mosaic-hist-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        add(&base, "Ther IV/A.md", "one", 7, 3).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        add(&base, "Ther IV/A.md", "one", 7, 3).unwrap(); // same text: not kept twice
        assert_eq!(list(&base, "Ther IV/A.md").len(), 1);
        for t in ["two", "three", "four"] {
            std::thread::sleep(std::time::Duration::from_millis(3));
            add(&base, "Ther IV/A.md", t, 7, 3).unwrap();
        }
        let v = list(&base, "Ther IV/A.md");
        assert_eq!(v.len(), 3, "capped at max");
        assert_eq!(get(&base, "Ther IV/A.md", v[0].t).unwrap(), "four");
        // a folder move carries it along
        mv(&base, "Ther IV", "Therapeutics IV", true).unwrap();
        assert!(list(&base, "Ther IV/A.md").is_empty());
        assert_eq!(list(&base, "Therapeutics IV/A.md").len(), 3);
        // a note rename too
        mv(&base, "Therapeutics IV/A.md", "Therapeutics IV/B.md", false).unwrap();
        assert_eq!(list(&base, "Therapeutics IV/B.md").len(), 3);
        let _ = fs::remove_dir_all(&base);
    }
}
