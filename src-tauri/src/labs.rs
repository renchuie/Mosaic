//! Recall Labs: scan the labs folder on the rclone mount, and serve its files at
//! tauri://localhost/__labs/… — the app's own origin — so labs and the dashboard
//! share one localStorage. (A separate lab:// origin in an iframe only got
//! session storage in WebKitGTK, so progress was lost on restart.)

use crate::store::{data_dir, read_json, write_atomic};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, State};
use http::header::{HeaderValue, CACHE_CONTROL, CONTENT_TYPE};

/// How much of each .html file to read when looking for the meta tag.
const HEAD_BYTES: u64 = 64 * 1024;
/// Labs larger than this are not searched for their slug (filename is used instead).
const MAX_LAB_BYTES: u64 = 40 * 1024 * 1024;
/// URL prefix the app uses for files in the labs folder.
pub const LABS_PREFIX: &str = "/__labs/";
/// URL prefix for files in the notes folder (pasted images).
pub const NOTES_PREFIX: &str = "/__notes/";

#[derive(Default)]
pub struct LabsState {
    pub root: Mutex<Option<PathBuf>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LabMeta {
    pub title: String,
    pub version: String,
    pub slug: String,
    /// true when the slug came from the file name because none was found in the HTML.
    pub slug_guessed: bool,
}

/// A Mosaic material file (.md with front matter `mosaic: <kind>`), e.g. a quiz.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MaterialMeta {
    /// "quiz" now; "case", "summary", "mindmap", "slides" later
    pub kind: String,
    pub title: String,
    /// stable id for progress (front matter `id:`, else the title)
    pub id: String,
    pub course: Option<String>,
    pub exam: Option<String>,
    /// number of questions (lines starting with "## ")
    pub count: u32,
}

#[derive(Serialize, Clone)]
pub struct Item {
    pub name: String,
    pub rel: String,
    /// "lab", "note" or "file"
    pub kind: &'static str,
    pub ext: String,
    pub size: u64,
    pub mtime: u64,
    pub lab: Option<LabMeta>,
    pub mat: Option<MaterialMeta>,
}

#[derive(Serialize, Clone)]
pub struct Folder {
    pub name: String,
    pub rel: String,
    pub folders: Vec<Folder>,
    pub items: Vec<Item>,
    /// true when the depth limit stopped the scan inside this folder.
    pub truncated: bool,
}

#[derive(Serialize)]
pub struct ScanResult {
    pub root: String,
    pub tree: Option<Folder>,
    pub error: Option<String>,
    pub scanned_at: u64,
    pub files_read: usize,
}

#[derive(Serialize, Deserialize, Clone)]
struct CacheEntry {
    mtime: u64,
    size: u64,
    lab: Option<LabMeta>,
    #[serde(default)]
    mat: Option<MaterialMeta>,
    /// cache entries written before materials existed never looked at .md files
    #[serde(default)]
    v2: bool,
}

pub fn expand_home(p: &str) -> PathBuf {
    let p = p.trim();
    // Windows has no HOME by default: USERPROFILE is C:\Users\<name>
    let home = || std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    if let Some(rest) = p.strip_prefix("~/").or_else(|| p.strip_prefix("~\\")) {
        if let Some(h) = home() {
            return PathBuf::from(h).join(rest);
        }
    } else if p == "~" {
        if let Some(h) = home() {
            return PathBuf::from(h);
        }
    }
    PathBuf::from(p)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

const NOTE_EXT: &[&str] = &["md", "txt", "docx", "doc", "odt", "rtf", "gdoc", "pages"];
const SKIP_NAMES: &[&str] = &["desktop.ini", "Thumbs.db", "Icon\r"];

#[tauri::command]
pub async fn scan_labs(
    app: AppHandle,
    state: State<'_, LabsState>,
    root: String,
    depth: u32,
) -> Result<ScanResult, String> {
    let root_path = expand_home(&root);
    *state.root.lock().unwrap() = Some(root_path.clone());
    let cache_path = data_dir(&app)?.join("labs-scan-cache.json");

    tauri::async_runtime::spawn_blocking(move || {
        let old: HashMap<String, CacheEntry> = read_json(&cache_path)
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        let mut new_cache = HashMap::new();
        let mut files_read = 0usize;

        if !root_path.is_dir() {
            return Ok(ScanResult {
                root: root_path.display().to_string(),
                tree: None,
                error: Some(format!(
                    "Folder not found: {}. Is your synced folder (Google Drive, Dropbox…) connected?",
                    root_path.display()
                )),
                scanned_at: now_secs(),
                files_read,
            });
        }
        let name = root_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Recall Labs".into());
        let tree = walk(&root_path, &root_path, name, depth.clamp(1, 8), &old, &mut new_cache, &mut files_read);
        if let Ok(bytes) = serde_json::to_vec(&new_cache) {
            let _ = write_atomic(&cache_path, &bytes);
        }
        Ok(ScanResult {
            root: root_path.display().to_string(),
            tree: Some(tree),
            error: None,
            scanned_at: now_secs(),
            files_read,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn rel_of(root: &Path, p: &Path) -> String {
    p.strip_prefix(root)
        .unwrap_or(p)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn walk(
    root: &Path,
    dir: &Path,
    name: String,
    depth_left: u32,
    old: &HashMap<String, CacheEntry>,
    cache: &mut HashMap<String, CacheEntry>,
    files_read: &mut usize,
) -> Folder {
    let mut folder = Folder { name, rel: rel_of(root, dir), folders: vec![], items: vec![], truncated: false };
    let Ok(entries) = fs::read_dir(dir) else { return folder };

    for entry in entries.flatten() {
        let fname = entry.file_name().to_string_lossy().into_owned();
        if fname.starts_with('.') || SKIP_NAMES.contains(&fname.as_str()) {
            continue;
        }
        let path = entry.path();
        let Ok(md) = fs::metadata(&path) else { continue };
        if md.is_dir() {
            if depth_left > 1 {
                folder.folders.push(walk(root, &path, fname, depth_left - 1, old, cache, files_read));
            } else {
                folder.truncated = true;
            }
            continue;
        }
        let rel = rel_of(root, &path);
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let size = md.len();
        let mtime = md
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let mut lab = None;
        let mut mat = None;
        if ext == "html" || ext == "htm" || ext == "md" {
            (lab, mat) = match old.get(&rel) {
                Some(c) if c.mtime == mtime && c.size == size && (c.v2 || ext != "md") => (c.lab.clone(), c.mat.clone()),
                _ => {
                    *files_read += 1;
                    if ext == "md" { (None, inspect_md(&path, size)) } else { (inspect_html(&path, size), None) }
                }
            };
            cache.insert(rel.clone(), CacheEntry { mtime, size, lab: lab.clone(), mat: mat.clone(), v2: true });
        }
        let kind = if lab.is_some() {
            "lab"
        } else if mat.is_some() {
            "material"
        } else if NOTE_EXT.contains(&ext.as_str()) {
            "note"
        } else {
            "file"
        };
        folder.items.push(Item { name: fname, rel, kind, ext, size, mtime, lab, mat });
    }
    folder.folders.sort_by_key(|f| f.name.to_lowercase());
    folder.items.sort_by_key(|i| i.name.to_lowercase());
    folder
}

/// Material info if this Markdown file starts with front matter holding `mosaic: <kind>`.
fn inspect_md(path: &Path, size: u64) -> Option<MaterialMeta> {
    let mut head = Vec::new();
    fs::File::open(path).ok()?.take(HEAD_BYTES).read_to_end(&mut head).ok()?;
    let head = String::from_utf8_lossy(&head);
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let mut m = parse_material(&head, &stem)?;
    if size <= MAX_LAB_BYTES {
        if let Ok(full) = fs::read_to_string(path) {
            m.count = count_questions(&full);
        }
    }
    Some(m)
}

/// Reads the front matter block at the very top: `mosaic:`, `title:`, `id:`, `course:`, `exam:`.
pub fn parse_material(text: &str, stem: &str) -> Option<MaterialMeta> {
    let text = text.trim_start_matches('\u{feff}');
    let mut lines = text.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    let mut kind = None;
    let (mut title, mut id, mut course, mut exam) = (None, None, None, None);
    for line in lines {
        let l = line.trim();
        if l == "---" {
            break;
        }
        let Some((k, v)) = l.split_once(':') else { continue };
        let v = v.split(" #").next().unwrap_or("").trim().trim_matches(|c| c == '"' || c == '\'').trim().to_string();
        match k.trim().to_lowercase().as_str() {
            "mosaic" => kind = Some(v.to_lowercase()),
            "title" if !v.is_empty() => title = Some(v),
            "id" if !v.is_empty() => id = Some(v),
            "course" if !v.is_empty() => course = Some(v),
            "exam" if !v.is_empty() => exam = Some(v),
            _ => {}
        }
    }
    let kind = kind.filter(|k| !k.is_empty())?;
    let title = title.unwrap_or_else(|| stem.to_string());
    let id = id.unwrap_or_else(|| slugify(&title));
    Some(MaterialMeta { kind, title, id, course, exam, count: count_questions(text) })
}

fn count_questions(text: &str) -> u32 {
    let mut in_code = false;
    let mut n = 0;
    for l in text.lines() {
        if l.trim_start().starts_with("```") {
            in_code = !in_code;
        } else if !in_code && l.starts_with("## ") {
            n += 1;
        }
    }
    n
}

/// Returns lab info if this HTML file carries <meta name="recall-lab-version">.
fn inspect_html(path: &Path, size: u64) -> Option<LabMeta> {
    let mut head = Vec::new();
    fs::File::open(path).ok()?.take(HEAD_BYTES).read_to_end(&mut head).ok()?;
    let head = String::from_utf8_lossy(&head);
    let version = find_meta(&head, "recall-lab-version")?;
    let title = find_title(&head).unwrap_or_default();

    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let mut slug = find_slug(&head);
    if slug.is_none() && size <= MAX_LAB_BYTES {
        if let Ok(full) = fs::read(path) {
            slug = find_slug(&String::from_utf8_lossy(&full));
        }
    }
    let slug_guessed = slug.is_none();
    let slug = slug.unwrap_or_else(|| slugify(&stem));
    let title = if title.trim().is_empty() { stem } else { title };
    Some(LabMeta { title, version, slug, slug_guessed })
}

fn slugify(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_string()
}

/// Content of <meta name="NAME" content="…"> in any attribute order.
fn find_meta(html: &str, name: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(i) = lower[from..].find("<meta") {
        let start = from + i;
        let end = start + lower[start..].find('>')?;
        let tag = &html[start..end];
        if attr(tag, "name").map(|v| v.eq_ignore_ascii_case(name)).unwrap_or(false) {
            return attr(tag, "content").map(|v| v.trim().to_string());
        }
        from = end;
    }
    None
}

fn attr(tag: &str, key: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(i) = lower[from..].find(key) {
        let at = from + i;
        let before_ok = at == 0 || lower.as_bytes()[at - 1].is_ascii_whitespace();
        let rest = lower[at + key.len()..].trim_start();
        if before_ok && rest.starts_with('=') {
            let after_eq_off = tag.len() - rest.len() + 1;
            let val = tag[after_eq_off..].trim_start();
            let q = val.chars().next()?;
            return if q == '"' || q == '\'' {
                val[1..].find(q).map(|j| val[1..1 + j].to_string())
            } else {
                Some(val.split(|c: char| c.is_whitespace() || c == '/').next()?.to_string())
            };
        }
        from = at + key.len();
    }
    None
}

fn find_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let s = lower.find("<title")?;
    let s = s + lower[s..].find('>')? + 1;
    let e = s + lower[s..].find("</title>")?;
    let t = html[s..e].trim();
    Some(
        t.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&middot;", "·")
            .replace("&mdash;", "—")
            .replace("&ndash;", "–"),
    )
}

/// Most frequent literal `recallLab.<slug>.v3` in the text.
fn find_slug(text: &str) -> Option<String> {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    let needle = "recallLab.";
    let mut from = 0;
    while let Some(i) = text[from..].find(needle) {
        let s = from + i + needle.len();
        let len = text[s..]
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '_'))
            .unwrap_or(text.len() - s);
        if len > 0 && text[s + len..].starts_with(".v3") {
            *counts.entry(&text[s..s + len]).or_default() += 1;
        }
        from = s;
    }
    counts.into_iter().max_by_key(|(_, n)| *n).map(|(s, _)| s.to_string())
}

/// Resolve a path relative to the labs root, refusing anything that escapes it.
pub fn resolve(root: &Path, rel: &str) -> Option<PathBuf> {
    let mut out = root.to_path_buf();
    for comp in Path::new(rel.trim_start_matches('/')).components() {
        match comp {
            Component::Normal(c) => out.push(c),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out)
}

#[tauri::command]
pub fn open_in_system(state: State<'_, LabsState>, rel: String) -> Result<(), String> {
    let root = state.root.lock().unwrap().clone().ok_or("Labs folder not scanned yet")?;
    let path = resolve(&root, &rel).ok_or("Invalid path")?;
    if !path.exists() {
        return Err(format!("Not found: {}", path.display()));
    }
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not run xdg-open: {e}"))
}

pub fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn mime(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "mp3" => "audio/mpeg",
        "mp4" => "video/mp4",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

/// Called for every request to the app's own origin. Requests under /__labs/
/// are answered from the labs folder; everything else is left to Tauri.
pub fn serve(app: &AppHandle, request: &http::Request<Vec<u8>>, response: &mut http::Response<Cow<'static, [u8]>>) {
    let path = percent_decode(request.uri().path());
    let (rel, root) = if let Some(rel) = path.strip_prefix(LABS_PREFIX) {
        (rel, app.state::<LabsState>().root.lock().unwrap().clone())
    } else if let Some(rel) = path.strip_prefix(NOTES_PREFIX) {
        (rel, crate::notes::root_for_serving(&app.state::<crate::notes::NotesState>()))
    } else if let Some(rel) = path.strip_prefix(crate::pdfs::PDFS_PREFIX) {
        (rel, crate::pdfs::root_for_serving(&app.state::<crate::pdfs::PdfsState>()))
    } else {
        return;
    };
    let (status, ctype, body): (u16, &str, Vec<u8>) = match root.as_deref().and_then(|r| resolve(r, rel)) {
        None => (404, "text/plain; charset=utf-8", b"Labs folder not set".to_vec()),
        Some(file) => match fs::read(&file) {
            Ok(bytes) => (200, mime(rel), bytes),
            Err(_) => (404, "text/plain; charset=utf-8", b"Not found".to_vec()),
        },
    };
    *response.status_mut() = http::StatusCode::from_u16(status).unwrap_or(http::StatusCode::NOT_FOUND);
    let headers = response.headers_mut();
    headers.remove("Content-Security-Policy");
    headers.insert(CONTENT_TYPE, HeaderValue::from_str(ctype).unwrap());
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    *response.body_mut() = Cow::Owned(body);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn material_front_matter() {
        let q = "---\nmosaic: quiz\ntitle: \"Anticoag practice\"\ncourse: Therapeutics IV  # course name\nexam: Exam 5\n---\n\n## Q1 · single\nx\n## Q2 · tf\n```\n## not a question\n```\n";
        let m = parse_material(q, "file").unwrap();
        assert_eq!(m.kind, "quiz");
        assert_eq!(m.title, "Anticoag practice");
        assert_eq!(m.id, "anticoag-practice");
        assert_eq!(m.course.as_deref(), Some("Therapeutics IV"));
        assert_eq!(m.exam.as_deref(), Some("Exam 5"));
        assert_eq!(m.count, 2);
        assert!(parse_material("# Just a note\n", "n").is_none());
        assert!(parse_material("---\ntitle: x\n---\n", "n").is_none());
    }

    #[test]
    fn meta_any_order() {
        let h = r#"<head><meta charset="utf-8"><meta content="3.14.1" name="recall-lab-version"><title>Ther IV &amp; Exam 5</title>"#;
        assert_eq!(find_meta(h, "recall-lab-version").as_deref(), Some("3.14.1"));
        assert_eq!(find_title(h).as_deref(), Some("Ther IV & Exam 5"));
        let h2 = r#"<META NAME='recall-lab-version' CONTENT='3.2'>"#;
        assert_eq!(find_meta(h2, "recall-lab-version").as_deref(), Some("3.2"));
        assert_eq!(find_meta("<meta name=\"viewport\" content=\"x\">", "recall-lab-version"), None);
    }

    #[test]
    fn slug_most_frequent() {
        let t = "localStorage.getItem('recallLab.ther4-exam5.v3'); x='recallLab.ther4-exam5.v3'; y='recallLab.'+s+'.v3'; z='recallLab.other.v3'";
        assert_eq!(find_slug(t).as_deref(), Some("ther4-exam5"));
        assert_eq!(find_slug("const K = `recallLab.${SLUG}.v3`"), None);
    }

    #[test]
    fn resolve_blocks_escape() {
        let r = Path::new("/labs");
        assert_eq!(resolve(r, "a/b.html"), Some(PathBuf::from("/labs/a/b.html")));
        assert_eq!(resolve(r, "/a b/c.html"), Some(PathBuf::from("/labs/a b/c.html")));
        assert_eq!(resolve(r, "../etc/passwd"), None);
        assert_eq!(resolve(r, "a/../../x"), None);
    }

    #[test]
    fn decode() {
        assert_eq!(percent_decode("/Pharmacy%20School/a%2Fb.html"), "/Pharmacy School/a/b.html");
        assert_eq!(percent_decode("/100%"), "/100%");
        assert_eq!(slugify("Ther IV Exam 5 (v2)"), "ther-iv-exam-5-v2");
    }
}
