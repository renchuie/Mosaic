//! Notes: Markdown files in a folder on the Drive mount. The frontend parses and
//! indexes them; this module only lists, reads and writes files, safely.
//!
//! - Every path is relative to the notes folder and may not escape it.
//! - Writes are atomic (temp file + rename) and can be told the modification time the
//!   editor last saw, so a note changed on the other computer is never silently overwritten.
//! - Deleting moves the file into `.trash/` inside the notes folder.
//! - The folder is only created if its parent exists (Drive mounted).

use crate::labs::{expand_home, resolve};
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::State;

#[derive(Default)]
pub struct NotesState {
    pub root: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
pub struct NoteFile {
    pub rel: String,
    pub mtime: u64,
    pub size: u64,
}

#[derive(Serialize)]
pub struct NotesList {
    pub root: String,
    pub files: Vec<NoteFile>,
    pub dirs: Vec<String>,
}

fn mtime_ms(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn root_of(state: &State<'_, NotesState>) -> Result<PathBuf, String> {
    state.root.lock().unwrap().clone().ok_or_else(|| "Notes folder not loaded yet".into())
}

fn path_in(state: &State<'_, NotesState>, rel: &str) -> Result<PathBuf, String> {
    let root = root_of(state)?;
    let p = resolve(&root, rel).ok_or("Invalid path")?;
    if p == root {
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

fn walk(root: &Path, dir: &Path, depth: u32, files: &mut Vec<NoteFile>, dirs: &mut Vec<String>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let p = e.path();
        let Ok(md) = fs::metadata(&p) else { continue };
        if md.is_dir() {
            dirs.push(rel_of(root, &p));
            if depth > 0 {
                walk(root, &p, depth - 1, files, dirs);
            }
        } else if name.to_lowercase().ends_with(".md") {
            files.push(NoteFile { rel: rel_of(root, &p), mtime: mtime_ms(&p), size: md.len() });
        }
    }
}

#[tauri::command]
pub async fn notes_list(state: State<'_, NotesState>, root: String) -> Result<NotesList, String> {
    let r = expand_home(&root);
    if !r.is_dir() {
        let parent = r.parent().map(Path::to_path_buf).unwrap_or_default();
        if !parent.is_dir() {
            return Err(format!("{} isn't there. Is Google Drive mounted?", parent.display()));
        }
        fs::create_dir(&r).map_err(|e| format!("Could not create {}: {e}", r.display()))?;
    }
    *state.root.lock().unwrap() = Some(r.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = vec![];
        let mut dirs = vec![];
        walk(&r, &r, 8, &mut files, &mut dirs);
        files.sort_by(|a, b| a.rel.to_lowercase().cmp(&b.rel.to_lowercase()));
        dirs.sort_by_key(|d| d.to_lowercase());
        Ok(NotesList { root: r.display().to_string(), files, dirs })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn notes_read(state: State<'_, NotesState>, rel: String) -> Result<String, String> {
    let p = path_in(&state, &rel)?;
    tauri::async_runtime::spawn_blocking(move || fs::read_to_string(&p).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
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

/// Write a note. With `expected` (the mtime the editor loaded), refuse with "conflict"
/// if the file changed since. Returns the new mtime.
#[tauri::command]
pub async fn notes_write(state: State<'_, NotesState>, rel: String, content: String, expected: Option<u64>) -> Result<u64, String> {
    let p = path_in(&state, &rel)?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(exp) = expected {
            if p.exists() && mtime_ms(&p) != exp {
                return Err("conflict".to_string());
            }
        }
        write_atomic(&p, content.as_bytes())?;
        Ok(mtime_ms(&p))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Save a pasted image (base64) under the notes folder.
#[tauri::command]
pub async fn notes_write_file(state: State<'_, NotesState>, rel: String, base64: String) -> Result<(), String> {
    let p = path_in(&state, &rel)?;
    let bytes = decode_b64(&base64).ok_or("Bad image data")?;
    tauri::async_runtime::spawn_blocking(move || write_atomic(&p, &bytes))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn notes_mkdir(state: State<'_, NotesState>, rel: String) -> Result<(), String> {
    fs::create_dir_all(path_in(&state, &rel)?).map_err(|e| e.to_string())
}

/// Rename or move a note or folder. Never overwrites.
#[tauri::command]
pub fn notes_move(state: State<'_, NotesState>, from: String, to: String) -> Result<(), String> {
    let a = path_in(&state, &from)?;
    let b = path_in(&state, &to)?;
    if b.exists() {
        return Err(format!("“{to}” already exists"));
    }
    if let Some(dir) = b.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::rename(&a, &b).map_err(|e| e.to_string())
}

/// Move a note or folder into `.trash/` (recoverable from the file manager).
#[tauri::command]
pub fn notes_trash(state: State<'_, NotesState>, rel: String) -> Result<(), String> {
    let root = root_of(&state)?;
    let a = path_in(&state, &rel)?;
    let stamp = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let name = a.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let trash = root.join(".trash");
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    fs::rename(&a, trash.join(format!("{stamp}-{name}"))).map_err(|e| e.to_string())
}

fn decode_b64(s: &str) -> Option<Vec<u8>> {
    let s = s.split(',').last()?; // tolerate "data:image/png;base64,"
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => return None,
        } as u32)
    };
    let clean: Vec<u8> = s.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=').collect();
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    for chunk in clean.chunks(4) {
        let mut n = 0u32;
        for (i, &c) in chunk.iter().enumerate() {
            n |= val(c)? << (18 - 6 * i);
        }
        let bytes = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
        out.extend_from_slice(&bytes[..chunk.len().saturating_sub(1)]);
    }
    Some(out)
}

/// The notes folder, for serving images at /__notes/…
pub fn root_for_serving(state: &NotesState) -> Option<PathBuf> {
    state.root.lock().unwrap().clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64() {
        assert_eq!(decode_b64("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(decode_b64("data:image/png;base64,aGk=").unwrap(), b"hi");
        assert_eq!(decode_b64("YWJj").unwrap(), b"abc");
        assert!(decode_b64("a$b=").is_none());
    }

    #[test]
    fn walk_lists_markdown_only() {
        let base = std::env::temp_dir().join(format!("sd-notes-{}", std::process::id()));
        fs::create_dir_all(base.join("Ther IV/.hidden")).unwrap();
        fs::write(base.join("Ther IV/HF.md"), "# HF").unwrap();
        fs::write(base.join("Ther IV/slide.png"), "x").unwrap();
        fs::write(base.join(".secret.md"), "x").unwrap();
        let (mut f, mut d) = (vec![], vec![]);
        walk(&base, &base, 8, &mut f, &mut d);
        assert_eq!(f.iter().map(|x| x.rel.as_str()).collect::<Vec<_>>(), vec!["Ther IV/HF.md"]);
        assert_eq!(d, vec!["Ther IV"]);
        fs::remove_dir_all(&base).unwrap();
    }
}
