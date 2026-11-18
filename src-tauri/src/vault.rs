//! Local vault (Nov 18): "This computer only" storage. A vault is one folder (default ~/Mosaic,
//! named and placed by the user) holding Notes/, Materials/ and PDFs/, with a `.mosaic-vault`
//! marker. These commands back the folder picker, make the vault, and copy files between the
//! Drive folders and the vault. Copies never overwrite and never delete anything.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

use crate::labs::expand_home;

pub const PARTS: [&str; 3] = ["Notes", "Materials", "PDFs"];

#[derive(Serialize)]
pub struct DirList {
    /// the folder shown, absolute
    pub path: String,
    pub parent: Option<String>,
    /// the user's home folder, so the UI can show "~"
    pub home: String,
    /// visible subfolders, sorted
    pub dirs: Vec<String>,
}

fn home() -> PathBuf {
    expand_home("~")
}

/// Subfolders of `path` (empty = home), for the in-app folder picker.
#[tauri::command]
pub fn vault_dirs(path: String) -> Result<DirList, String> {
    let p = if path.trim().is_empty() { home() } else { expand_home(&path) };
    let rd = fs::read_dir(&p).map_err(|e| format!("Can't open {}: {e}", p.display()))?;
    let mut dirs: Vec<String> = rd
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| !n.starts_with('.'))
        .collect();
    dirs.sort_by_key(|d| d.to_lowercase());
    Ok(DirList {
        path: p.to_string_lossy().into_owned(),
        parent: p.parent().map(|x| x.to_string_lossy().into_owned()),
        home: home().to_string_lossy().into_owned(),
        dirs,
    })
}

/// Make the vault (or adopt an existing folder): the folder, its three parts and the marker.
#[tauri::command]
pub fn vault_create(path: String) -> Result<String, String> {
    let p = expand_home(&path);
    let parent = p.parent().ok_or("Pick a folder for the vault.")?;
    if !parent.is_dir() {
        return Err(format!("{} isn't there.", parent.display()));
    }
    if p.exists() && !p.is_dir() {
        return Err(format!("{} is a file, not a folder.", p.display()));
    }
    for part in PARTS {
        fs::create_dir_all(p.join(part)).map_err(|e| format!("Could not create the vault: {e}"))?;
    }
    let _ = fs::write(p.join(".mosaic-vault"), "Mosaic vault: Notes, Materials and PDFs live here.\n");
    Ok(p.to_string_lossy().into_owned())
}

/** Show a folder in the file manager. */
#[tauri::command]
pub fn vault_open(path: String) -> Result<(), String> {
    let p = expand_home(&path);
    if !p.is_dir() {
        return Err(format!("{} isn't there.", p.display()));
    }
    let cmd = if cfg!(windows) { "explorer" } else if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    std::process::Command::new(cmd).arg(&p).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[derive(Serialize, Default)]
pub struct CopyReport {
    pub copied: u32,
    /// already there with the same name (kept as is)
    pub skipped: u32,
    pub failed: u32,
}

/// Copy a folder's contents into another, keeping the folder structure. `only_pdf`: just PDF
/// files (the PDF folder is usually the whole school folder) plus the hidden originals backup.
/// Hidden folders (.trash, …) are left out otherwise. Never overwrites; the destination itself is
/// skipped if it sits inside the source.
#[tauri::command]
pub async fn vault_copy(from: String, to: String, only_pdf: bool) -> Result<CopyReport, String> {
    let a = expand_home(&from);
    let b = expand_home(&to);
    if !a.is_dir() {
        return Err(format!("{} isn't there. Is Google Drive mounted?", a.display()));
    }
    let bp = b.parent().map(Path::to_path_buf).unwrap_or_default();
    if !b.is_dir() && !bp.is_dir() {
        return Err(format!("{} isn't there. Is Google Drive mounted?", bp.display()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut r = CopyReport::default();
        copy_dir(&a, &b, &b, only_pdf, 0, &mut r);
        Ok(r)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn copy_dir(src: &Path, dst: &Path, stop: &Path, only_pdf: bool, depth: u32, r: &mut CopyReport) {
    if depth > 16 || src == stop {
        return;
    }
    let Ok(rd) = fs::read_dir(src) else { return };
    for e in rd.flatten() {
        let name = e.file_name();
        let n = name.to_string_lossy();
        let Ok(t) = e.file_type() else { continue };
        if t.is_symlink() {
            continue;
        }
        let s = e.path();
        let d = dst.join(&name);
        if t.is_dir() {
            if n.starts_with('.') && !(only_pdf && n == ".studydesk-originals") {
                continue;
            }
            copy_dir(&s, &d, stop, only_pdf, depth + 1, r);
        } else if t.is_file() {
            if only_pdf && !n.to_lowercase().ends_with(".pdf") {
                continue;
            }
            if d.exists() {
                r.skipped += 1;
                continue;
            }
            let ok = fs::create_dir_all(dst).is_ok() && fs::copy(&s, &d).is_ok();
            if ok {
                // keep the modification time, so "edited today" and sync checks stay right
                if let Ok(m) = fs::metadata(&s).and_then(|m| m.modified()) {
                    let _ = fs::File::options().write(true).open(&d).and_then(|f| f.set_modified(m));
                }
                r.copied += 1;
            } else {
                r.failed += 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copies_without_overwriting() {
        let base = std::env::temp_dir().join(format!("mosaic-vault-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let src = base.join("drive/Notes");
        fs::create_dir_all(src.join("Ther IV")).unwrap();
        fs::create_dir_all(src.join(".trash")).unwrap();
        fs::write(src.join("Ther IV/HF.md"), "hf").unwrap();
        fs::write(src.join(".trash/old.md"), "x").unwrap();
        fs::write(src.join("a.pdf"), "pdf").unwrap();
        let v = vault_create(base.join("Mosaic").to_string_lossy().into_owned()).unwrap();
        let dst = Path::new(&v).join("Notes");
        fs::write(dst.join("a.pdf"), "mine").unwrap();
        let mut r = CopyReport::default();
        copy_dir(&src, &dst, &dst, false, 0, &mut r);
        assert_eq!(fs::read_to_string(dst.join("Ther IV/HF.md")).unwrap(), "hf");
        assert!(!dst.join(".trash").exists());
        assert_eq!(fs::read_to_string(dst.join("a.pdf")).unwrap(), "mine");
        assert_eq!((r.copied, r.skipped), (1, 1));
        let mut r2 = CopyReport::default();
        let pdfs = Path::new(&v).join("PDFs");
        copy_dir(&src, &pdfs, &pdfs, true, 0, &mut r2);
        assert!(pdfs.join("a.pdf").exists() && !pdfs.join("Ther IV/HF.md").exists());
        assert!(Path::new(&v).join(".mosaic-vault").exists());
        let _ = fs::remove_dir_all(&base);
    }
}
