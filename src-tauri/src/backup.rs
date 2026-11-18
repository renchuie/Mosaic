//! Backups (Nov 19, her picks: a copy on this computer AND on Drive; app data + every note's text).
//! One JSON file per machine per day, `mosaic-backup-<YYYY-MM-DD>-<machine>.json`, the newest 14 per
//! machine kept. The frontend builds the content (src/lib/backup.ts). A Drive folder is only created
//! when its parent exists (same rule as the sync folder), so nothing lands under an empty mount point.

use crate::notes::NotesState;
use crate::sync::sync_dir;
use std::path::Path;
use tauri::State;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::time::UNIX_EPOCH;

const PREFIX: &str = "mosaic-backup-";

fn valid(name: &str) -> bool {
    name.starts_with(PREFIX)
        && name.ends_with(".json")
        && name.len() <= 120
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

#[derive(Serialize)]
pub struct BackupFile {
    pub name: String,
    pub size: u64,
    pub mtime: u64,
}

#[tauri::command]
pub async fn backup_write(dir: String, file: String, content: String) -> Result<(), String> {
    if !valid(&file) {
        return Err(format!("invalid backup file name: {file}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let d = sync_dir(&dir, true)?.ok_or("backup folder missing")?;
        let tmp = d.join(format!(".{file}.tmp"));
        {
            let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
            f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
            f.sync_all().map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp, d.join(&file)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn backup_list(dir: String) -> Result<Vec<BackupFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(d) = sync_dir(&dir, false)? else { return Ok(vec![]) };
        let mut out = vec![];
        for e in fs::read_dir(&d).map_err(|e| e.to_string())?.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if !valid(&name) {
                continue;
            }
            let Ok(m) = e.metadata() else { continue };
            let mtime = m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
            out.push(BackupFile { name, size: m.len(), mtime });
        }
        out.sort_by(|a, b| b.name.cmp(&a.name));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn backup_read(dir: String, file: String) -> Result<String, String> {
    if !valid(&file) {
        return Err(format!("invalid backup file name: {file}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let d = sync_dir(&dir, false)?.ok_or("backup folder missing")?;
        fs::read_to_string(d.join(&file)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Keep the newest `keep` backups of one machine (names sort by date); returns how many went.
#[tauri::command]
pub async fn backup_prune(dir: String, machine: String, keep: usize) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(d) = sync_dir(&dir, false)? else { return Ok(0) };
        let suffix = format!("-{machine}.json");
        let mut mine: Vec<String> = fs::read_dir(&d)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| valid(n) && n.ends_with(&suffix))
            .collect();
        mine.sort();
        mine.reverse();
        let mut gone = 0;
        for n in mine.into_iter().skip(keep.max(1)) {
            if fs::remove_file(d.join(&n)).is_ok() {
                gone += 1;
            }
        }
        Ok(gone)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Copy every file under `src` that `dst` doesn't have yet (or has with another size). Pasted
/// images never change once saved, so a daily backup only copies the new ones. Never deletes.
pub fn copy_missing(src: &Path, dst: &Path) -> Result<usize, String> {
    if !src.is_dir() {
        return Ok(0);
    }
    let mut n = 0;
    for e in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let name = e.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let (a, b) = (e.path(), dst.join(&name));
        if a.is_dir() {
            n += copy_missing(&a, &b)?;
        } else {
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            if fs::metadata(&b).map(|m| m.len()).ok() == Some(size) {
                continue;
            }
            fs::create_dir_all(dst).map_err(|e| e.to_string())?;
            let tmp = dst.join(format!(".{}.tmp", name.to_string_lossy()));
            fs::copy(&a, &tmp).map_err(|e| e.to_string())?;
            fs::rename(&tmp, &b).map_err(|e| e.to_string())?;
            n += 1;
        }
    }
    Ok(n)
}

fn notes_root(state: &State<'_, NotesState>) -> Result<std::path::PathBuf, String> {
    state.root.lock().unwrap().clone().ok_or_else(|| "Notes folder not loaded yet".into())
}

/// The notes folder's pasted images (attachments/) into `<backup folder>/attachments/`.
#[tauri::command]
pub async fn backup_attachments(state: State<'_, NotesState>, dir: String) -> Result<usize, String> {
    let root = notes_root(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let d = sync_dir(&dir, true)?.ok_or("backup folder missing")?;
        copy_missing(&root.join("attachments"), &d.join("attachments"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Put back pasted images the notes folder is missing (restoring a backup).
#[tauri::command]
pub async fn backup_restore_attachments(state: State<'_, NotesState>, dir: String) -> Result<usize, String> {
    let root = notes_root(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(d) = sync_dir(&dir, false)? else { return Ok(0) };
        copy_missing(&d.join("attachments"), &root.join("attachments"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert!(valid("mosaic-backup-2026-11-19-arch-pc-1a2b.json"));
        assert!(!valid("mosaic-backup-../x.json"));
        assert!(!valid("other.json"));
        assert!(!valid("mosaic-backup-2026.txt"));
    }

    #[test]
    fn write_list_prune() {
        let base = std::env::temp_dir().join(format!("mosaic-bk-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let dir = base.join("Backups").to_string_lossy().into_owned();
        for day in 1..=5 {
            tauri::async_runtime::block_on(backup_write(dir.clone(), format!("mosaic-backup-2026-11-0{day}-pc.json"), "{}".into())).unwrap();
        }
        tauri::async_runtime::block_on(backup_write(dir.clone(), "mosaic-backup-2026-11-01-laptop.json".into(), "{}".into())).unwrap();
        assert_eq!(tauri::async_runtime::block_on(backup_list(dir.clone())).unwrap().len(), 6);
        assert_eq!(tauri::async_runtime::block_on(backup_prune(dir.clone(), "pc".into(), 3)).unwrap(), 2);
        let left: Vec<String> = tauri::async_runtime::block_on(backup_list(dir.clone())).unwrap().into_iter().map(|f| f.name).collect();
        assert!(left.contains(&"mosaic-backup-2026-11-05-pc.json".to_string()));
        assert!(!left.contains(&"mosaic-backup-2026-11-01-pc.json".to_string()));
        assert!(left.contains(&"mosaic-backup-2026-11-01-laptop.json".to_string()), "another machine's backups are left alone");
        assert_eq!(tauri::async_runtime::block_on(backup_read(dir.clone(), "mosaic-backup-2026-11-05-pc.json".into())).unwrap(), "{}");
        // a Drive folder whose parent is missing is refused, not created
        let missing = base.join("NoDrive").join("Backups").to_string_lossy().into_owned();
        assert!(tauri::async_runtime::block_on(backup_write(missing, "mosaic-backup-2026-11-01-pc.json".into(), "{}".into())).is_err());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn images_copied_once() {
        let base = std::env::temp_dir().join(format!("mosaic-att-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let src = base.join("Notes/attachments");
        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("a.png"), b"png").unwrap();
        fs::write(src.join("sub/b.png"), b"png2").unwrap();
        let dst = base.join("Backups/attachments");
        assert_eq!(copy_missing(&src, &dst).unwrap(), 2);
        assert_eq!(copy_missing(&src, &dst).unwrap(), 0, "already there: nothing copied");
        fs::write(src.join("c.png"), b"new").unwrap();
        assert_eq!(copy_missing(&src, &dst).unwrap(), 1);
        fs::remove_file(src.join("a.png")).unwrap();
        assert_eq!(copy_missing(&dst, &src).unwrap(), 1, "restore brings back the missing one");
        assert_eq!(fs::read(src.join("a.png")).unwrap(), b"png");
        let _ = fs::remove_dir_all(&base);
    }
}
