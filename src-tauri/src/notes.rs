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
            // a save of a note that was there when it was read: never bring back a file that
            // has since been moved, renamed or trashed (that duplicated notes moved twice fast)
            if !p.exists() {
                return Err("missing".to_string());
            }
            if mtime_ms(&p) != exp {
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
pub async fn notes_mkdir(state: State<'_, NotesState>, rel: String) -> Result<(), String> {
    fs::create_dir_all(path_in(&state, &rel)?).map_err(|e| e.to_string())
}

/// Rename or move a note or folder. Never overwrites.
#[tauri::command]
pub async fn notes_move(state: State<'_, NotesState>, from: String, to: String) -> Result<(), String> {
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
pub async fn notes_trash(state: State<'_, NotesState>, rel: String) -> Result<(), String> {
    let root = root_of(&state)?;
    let a = path_in(&state, &rel)?;
    tauri::async_runtime::spawn_blocking(move || trash_into(&root, &a, &rel)).await.map_err(|e| e.to_string())?
}

/// Move a note or folder into `.trash/` as `<secs>-<name>`, with `<that>.from` holding where it
/// came from (Nov 19: the in-app Trash puts things back where they were).
pub fn trash_into(root: &Path, a: &Path, rel: &str) -> Result<(), String> {
    let stamp = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let name = a.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let trash = root.join(".trash");
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let mut id = format!("{stamp}-{name}");
    let mut i = 2;
    while trash.join(&id).exists() {
        id = format!("{stamp}-{i}-{name}");
        i += 1;
    }
    fs::rename(a, trash.join(&id)).map_err(|e| e.to_string())?;
    let _ = fs::write(trash.join(format!("{id}.from")), rel);
    Ok(())
}

#[derive(Serialize, Debug)]
pub struct TrashItem {
    /// the entry's name inside .trash
    pub id: String,
    /// its own name ("Lithium.md", "Exam 5")
    pub name: String,
    /// the path it had in the notes folder ("" for things trashed before Nov 19)
    pub from: String,
    /// when it was deleted (ms)
    pub deleted: u64,
    pub dir: bool,
}

pub fn trash_list(root: &Path) -> Vec<TrashItem> {
    let trash = root.join(".trash");
    let mut out: Vec<TrashItem> = fs::read_dir(&trash)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let id = e.file_name().to_string_lossy().into_owned();
            if id.ends_with(".from") || id.starts_with('.') {
                return None;
            }
            let (stamp, rest) = id.split_once('-').unwrap_or(("0", &id));
            let secs = stamp.parse::<u64>().unwrap_or(0);
            let from = fs::read_to_string(trash.join(format!("{id}.from"))).unwrap_or_default();
            // the name from where it came from (the entry may be "<secs>-<n>-name" after a clash)
            let name = if from.is_empty() { rest.to_string() } else { from.rsplit('/').next().unwrap_or(rest).to_string() };
            Some(TrashItem { name, from, deleted: secs * 1000, dir: e.path().is_dir(), id })
        })
        .collect();
    out.sort_by(|a, b| b.deleted.cmp(&a.deleted));
    out
}

/// Put an entry back where it came from (its folder is made again if needed); a name already in
/// use gets " (restored)". Returns its path in the notes folder.
pub fn trash_restore(root: &Path, id: &str) -> Result<String, String> {
    let item = trash_list(root).into_iter().find(|t| t.id == id).ok_or("It isn't in the trash any more.")?;
    let want = if item.from.is_empty() { item.name.clone() } else { item.from.clone() };
    let (dir, file) = match want.rsplit_once('/') {
        Some((d, f)) => (d.to_string(), f.to_string()),
        None => (String::new(), want.clone()),
    };
    let (stem, ext) = if !item.dir && file.to_lowercase().ends_with(".md") { (file[..file.len() - 3].to_string(), ".md") } else { (file.clone(), "") };
    let join = |f: &str| if dir.is_empty() { f.to_string() } else { format!("{dir}/{f}") };
    let mut rel = join(&file);
    let mut n = 1;
    while root.join(&rel).exists() {
        rel = join(&format!("{stem} (restored{}){ext}", if n == 1 { String::new() } else { format!(" {n}") }));
        n += 1;
    }
    let dest = resolve(root, &rel).ok_or("Invalid path")?;
    if let Some(p) = dest.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let trash = root.join(".trash");
    fs::rename(trash.join(id), &dest).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(trash.join(format!("{id}.from")));
    Ok(rel)
}

/// Delete trash entries for good: one (`id`), or everything older than `days` (`id` empty;
/// days 0 = everything).
pub fn trash_purge(root: &Path, id: &str, days: u64) -> Result<usize, String> {
    let trash = root.join(".trash");
    let cutoff = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0).saturating_sub(days * 86_400_000);
    let mut n = 0;
    for t in trash_list(root) {
        if (!id.is_empty() && t.id != id) || (id.is_empty() && days > 0 && t.deleted >= cutoff) {
            continue;
        }
        let p = trash.join(&t.id);
        let ok = if t.dir { fs::remove_dir_all(&p) } else { fs::remove_file(&p) };
        if ok.is_ok() {
            let _ = fs::remove_file(trash.join(format!("{}.from", t.id)));
            n += 1;
        }
    }
    Ok(n)
}

#[tauri::command]
pub async fn notes_trash_list(state: State<'_, NotesState>) -> Result<Vec<TrashItem>, String> {
    let root = root_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || Ok(trash_list(&root))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn notes_trash_restore(state: State<'_, NotesState>, id: String) -> Result<String, String> {
    let root = root_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || trash_restore(&root, &id)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn notes_trash_purge(state: State<'_, NotesState>, id: String, days: u64) -> Result<usize, String> {
    let root = root_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || trash_purge(&root, &id, days)).await.map_err(|e| e.to_string())?
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

#[cfg(test)]
mod trash_tests {
    use super::*;

    #[test]
    fn trash_and_restore() {
        let root = std::env::temp_dir().join(format!("mosaic-trash-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("Ther IV")).unwrap();
        fs::write(root.join("Ther IV/Lithium.md"), "li").unwrap();
        fs::write(root.join("2024-notes.md"), "n").unwrap();
        trash_into(&root, &root.join("2024-notes.md"), "2024-notes.md").unwrap();
        assert_eq!(trash_list(&root)[0].name, "2024-notes.md");
        trash_purge(&root, &trash_list(&root)[0].id, 0).unwrap();
        fs::create_dir_all(root.join("Old/Sub")).unwrap();
        fs::write(root.join("Old/Sub/x.md"), "x").unwrap();
        trash_into(&root, &root.join("Ther IV/Lithium.md"), "Ther IV/Lithium.md").unwrap();
        trash_into(&root, &root.join("Old"), "Old").unwrap();
        // an entry from before .from files existed
        fs::write(root.join(".trash/100-Legacy.md"), "l").unwrap();
        let items = trash_list(&root);
        assert_eq!(items.len(), 3);
        let li = items.iter().find(|t| t.name == "Lithium.md").unwrap();
        assert_eq!(li.from, "Ther IV/Lithium.md");
        assert!(items.iter().find(|t| t.name == "Old").unwrap().dir);
        // a new note took the name meanwhile: the restored one gets " (restored)"
        fs::write(root.join("Ther IV/Lithium.md"), "new").unwrap();
        let r = trash_restore(&root, &li.id).unwrap();
        assert_eq!(r, "Ther IV/Lithium (restored).md");
        assert_eq!(fs::read_to_string(root.join(&r)).unwrap(), "li");
        let old = trash_list(&root).into_iter().find(|t| t.name == "Old").unwrap();
        assert_eq!(trash_restore(&root, &old.id).unwrap(), "Old");
        assert!(root.join("Old/Sub/x.md").exists());
        assert_eq!(trash_restore(&root, "100-Legacy.md").unwrap(), "Legacy.md");
        // purge: old entries only, then one by id
        fs::write(root.join("A.md"), "a").unwrap();
        trash_into(&root, &root.join("A.md"), "A.md").unwrap();
        fs::write(root.join(".trash/5-Ancient.md"), "z").unwrap();
        assert_eq!(trash_purge(&root, "", 30).unwrap(), 1, "only the 1970 one is older than 30 days");
        let a = trash_list(&root).into_iter().next().unwrap();
        assert_eq!(trash_purge(&root, &a.id, 0).unwrap(), 1);
        assert!(trash_list(&root).is_empty());
        assert!(fs::read_dir(root.join(".trash")).unwrap().next().is_none(), ".from files go too");
        let _ = fs::remove_dir_all(&root);
    }
}
