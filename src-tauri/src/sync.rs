//! Sync through a folder on the Google Drive mount. Each machine writes only
//! its own file (<machine>.json) and reads everyone else's, so two machines
//! never write the same file and rclone never sees a conflict. Merging happens
//! in the frontend (src/lib/stores/synced.svelte.ts).

use crate::labs::expand_home;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
pub struct RemoteFile {
    pub name: String,
    pub content: String,
    pub mtime: u64,
}

fn valid_file(name: &str) -> bool {
    name.ends_with(".json")
        && name.len() <= 80
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

/// The sync folder, refusing to create it when its parent is missing: that
/// usually means Google Drive is not mounted, and writing under the empty
/// mount point would hide the files once it is.
pub(crate) fn sync_dir(dir: &str, create: bool) -> Result<Option<PathBuf>, String> {
    let d = expand_home(dir);
    if d.is_dir() {
        return Ok(Some(d));
    }
    let parent = d.parent().map(Path::to_path_buf).unwrap_or_default();
    if !parent.is_dir() {
        return Err(format!("{} isn't there. Is Google Drive mounted?", parent.display()));
    }
    if !create {
        return Ok(None);
    }
    fs::create_dir(&d).map_err(|e| format!("Could not create {}: {e}", d.display()))?;
    Ok(Some(d))
}

#[tauri::command]
pub fn machine_name() -> String {
    ["/proc/sys/kernel/hostname", "/etc/hostname"]
        .iter()
        .find_map(|p| fs::read_to_string(p).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "computer".into())
}

#[tauri::command]
pub async fn sync_write(dir: String, file: String, content: String) -> Result<(), String> {
    if !valid_file(&file) {
        return Err(format!("invalid sync file name: {file}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let d = sync_dir(&dir, true)?.ok_or("sync folder missing")?;
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
pub async fn sync_read(dir: String) -> Result<Vec<RemoteFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(d) = sync_dir(&dir, false)? else { return Ok(vec![]) };
        let mut out = vec![];
        for entry in fs::read_dir(&d).map_err(|e| e.to_string())?.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !valid_file(&name) {
                continue;
            }
            let Ok(content) = fs::read_to_string(entry.path()) else { continue };
            let mtime = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            out.push(RemoteFile { name, content, mtime });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names() {
        assert!(valid_file("archpc-1a2b.json"));
        assert!(!valid_file(".archpc.json.tmp"));
        assert!(!valid_file("../x.json"));
        assert!(!valid_file("a/b.json"));
    }

    #[test]
    fn refuses_unmounted_parent() {
        let base = std::env::temp_dir().join(format!("sd-sync-test-{}", std::process::id()));
        let missing = base.join("not-mounted/Study Desk Sync");
        assert!(sync_dir(missing.to_str().unwrap(), true).is_err());
        fs::create_dir_all(&base).unwrap();
        let ok = base.join("Study Desk Sync");
        assert_eq!(sync_dir(ok.to_str().unwrap(), false).unwrap(), None);
        assert_eq!(sync_dir(ok.to_str().unwrap(), true).unwrap(), Some(ok.clone()));
        fs::remove_dir_all(&base).unwrap();
    }
}
