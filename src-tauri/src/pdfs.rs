//! PDFs: listed from a folder on the Drive mount (default the whole school folder),
//! served at /__pdfs/… for pdf.js, and written back when she annotates.
//!
//! - Every path is relative to the PDFs folder and may not escape it.
//! - The first time a PDF is written, the untouched original is copied to
//!   `.studydesk-originals/<same path>` inside the PDFs folder (never overwritten), so
//!   "Restore original" always works and the backup syncs with Drive.
//! - Writes are atomic and refuse with "conflict" if the file changed since it was read.
//! - The bytes travel as a raw IPC body (no base64), the path in a header.

use crate::labs::{expand_home, resolve};
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

pub const PDFS_PREFIX: &str = "/__pdfs/";
const ORIGINALS: &str = ".studydesk-originals";

#[derive(Default)]
pub struct PdfsState {
    pub root: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
pub struct PdfFile {
    pub rel: String,
    pub mtime: u64,
    pub size: u64,
}

#[derive(Serialize)]
pub struct PdfList {
    pub root: String,
    pub files: Vec<PdfFile>,
}

fn mtime_ms(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn root_of(state: &State<'_, PdfsState>) -> Result<PathBuf, String> {
    state.root.lock().unwrap().clone().ok_or_else(|| "PDF folder not loaded yet".into())
}

fn path_in(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = resolve(root, rel).ok_or("Invalid path")?;
    if p == root || !rel.to_lowercase().ends_with(".pdf") {
        return Err("Invalid path".into());
    }
    Ok(p)
}

fn rel_of(root: &Path, p: &Path) -> String {
    p.strip_prefix(root)
        .unwrap_or(p)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn walk(root: &Path, dir: &Path, depth: u32, files: &mut Vec<PdfFile>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue; // .trash, .studydesk-originals, temp files
        }
        let p = e.path();
        let Ok(md) = fs::metadata(&p) else { continue };
        if md.is_dir() {
            if depth > 0 {
                walk(root, &p, depth - 1, files);
            }
        } else if name.to_lowercase().ends_with(".pdf") {
            files.push(PdfFile { rel: rel_of(root, &p), mtime: mtime_ms(&p), size: md.len() });
        }
    }
}

#[tauri::command]
pub async fn pdfs_list(state: State<'_, PdfsState>, root: String, depth: Option<u32>) -> Result<PdfList, String> {
    let r = expand_home(&root);
    if !r.is_dir() {
        return Err(format!("{} isn't there. Is Google Drive mounted?", r.display()));
    }
    *state.root.lock().unwrap() = Some(r.clone());
    let depth = depth.unwrap_or(6);
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = vec![];
        walk(&r, &r, depth, &mut files);
        files.sort_by(|a, b| a.rel.to_lowercase().cmp(&b.rel.to_lowercase()));
        Ok(PdfList { root: r.display().to_string(), files })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn pdfs_stat(state: State<'_, PdfsState>, rel: String) -> Result<(u64, bool), String> {
    let root = root_of(&state)?;
    let p = path_in(&root, &rel)?;
    Ok((mtime_ms(&p), root.join(ORIGINALS).join(&rel).exists()))
}

fn write_atomic(p: &Path, bytes: &[u8]) -> Result<(), String> {
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = p.with_file_name(format!(".{name}.sdtmp"));
    {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(bytes).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, p).map_err(|e| e.to_string())
}

fn backup_once(root: &Path, rel: &str, p: &Path) -> Result<(), String> {
    let b = root.join(ORIGINALS).join(rel);
    if b.exists() {
        return Ok(());
    }
    if let Some(dir) = b.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not back up the original: {e}"))?;
    }
    fs::copy(p, &b).map_err(|e| format!("Could not back up the original: {e}"))?;
    Ok(())
}

fn header(req: &Request<'_>, key: &str) -> Option<String> {
    let v = req.headers().get(key)?.to_str().ok()?;
    Some(crate::labs::percent_decode(v))
}

/// Body: the new PDF bytes. Headers: `x-rel` (percent-encoded path), `x-expected`
/// (the mtime it was read at). Returns the new mtime.
#[tauri::command]
pub async fn pdfs_write(state: State<'_, PdfsState>, request: Request<'_>) -> Result<u64, String> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err("Expected PDF bytes".into()) };
    if !bytes.starts_with(b"%PDF") {
        return Err("That isn't a PDF".into());
    }
    let rel = header(&request, "x-rel").ok_or("Missing path")?;
    let expected: Option<u64> = header(&request, "x-expected").and_then(|s| s.parse().ok());
    let root = root_of(&state)?;
    let p = path_in(&root, &rel)?;
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !p.exists() {
            return Err("The PDF is gone (moved or deleted?)".to_string());
        }
        if let Some(exp) = expected {
            if mtime_ms(&p) != exp {
                return Err("conflict".to_string());
            }
        }
        backup_once(&root, &rel, &p)?;
        write_atomic(&p, &bytes)?;
        Ok(mtime_ms(&p))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Put the backed-up original back (annotations made in Study Desk are gone after this).
#[tauri::command]
pub fn pdfs_restore(state: State<'_, PdfsState>, rel: String) -> Result<u64, String> {
    let root = root_of(&state)?;
    let p = path_in(&root, &rel)?;
    let b = root.join(ORIGINALS).join(&rel);
    let bytes = fs::read(&b).map_err(|_| "No backup of the original was found".to_string())?;
    write_atomic(&p, &bytes)?;
    Ok(mtime_ms(&p))
}

/// Open the PDF in her default PDF app (or show it in the file manager with `folder`).
#[tauri::command]
pub fn pdfs_open(state: State<'_, PdfsState>, rel: String, folder: Option<bool>) -> Result<(), String> {
    let root = root_of(&state)?;
    let p = path_in(&root, &rel)?;
    let target = if folder.unwrap_or(false) { p.parent().map(Path::to_path_buf).unwrap_or(root) } else { p };
    std::process::Command::new("xdg-open")
        .arg(&target)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not run xdg-open: {e}"))
}

/// The PDFs folder, for serving files at /__pdfs/…
pub fn root_for_serving(state: &PdfsState) -> Option<PathBuf> {
    state.root.lock().unwrap().clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_pdfs_skipping_hidden() {
        let d = std::env::temp_dir().join(format!("sd-pdfs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(d.join("Ther IV")).unwrap();
        fs::create_dir_all(d.join(ORIGINALS)).unwrap();
        fs::write(d.join("Ther IV/Lecture 1.PDF"), b"%PDF-1.4").unwrap();
        fs::write(d.join(ORIGINALS).join("x.pdf"), b"%PDF-1.4").unwrap();
        fs::write(d.join("notes.md"), b"#").unwrap();
        let mut files = vec![];
        walk(&d, &d, 6, &mut files);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].rel, "Ther IV/Lecture 1.PDF");
        backup_once(&d, "Ther IV/Lecture 1.PDF", &d.join("Ther IV/Lecture 1.PDF")).unwrap();
        fs::write(d.join("Ther IV/Lecture 1.PDF"), b"%PDF-1.4 changed").unwrap();
        backup_once(&d, "Ther IV/Lecture 1.PDF", &d.join("Ther IV/Lecture 1.PDF")).unwrap();
        assert_eq!(fs::read(d.join(ORIGINALS).join("Ther IV/Lecture 1.PDF")).unwrap(), b"%PDF-1.4");
        assert!(path_in(&d, "../x.pdf").is_err());
        assert!(path_in(&d, "notes.md").is_err());
        let _ = fs::remove_dir_all(&d);
    }
}
