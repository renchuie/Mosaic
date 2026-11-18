// Reading Anki packages (.apkg / .colpkg) for the card library import (F1, Nov 19).
// A package is a zip: the collection (SQLite; `collection.anki21b` is zstd-compressed, the
// newest format; `collection.anki21` / `.anki2` are plain), a `media` index and the media
// files named 0, 1, 2… (zstd-compressed in the newest format). We read it into plain JSON
// (note types, decks, notes, cards, review log) and the TypeScript side (src/lib/anki.ts) maps
// that onto the card library. Images are copied into the notes folder's attachments/anki/,
// never over a different file.
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

use crate::notes::{root_of, write_atomic, NotesState};

const ZSTD_MAGIC: [u8; 4] = [0x28, 0xb5, 0x2f, 0xfd];

fn unzstd(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut dec = ruzstd::StreamingDecoder::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    dec.read_to_end(&mut out).map_err(|e| e.to_string())?;
    Ok(out)
}
fn maybe_unzstd(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    if bytes.starts_with(&ZSTD_MAGIC) { unzstd(&bytes) } else { Ok(bytes) }
}

// ---- a tiny protobuf reader (the newest format keeps note type / template settings and the
// media index as protobuf) -------------------------------------------------------------------

enum Pb<'a> {
    Int(u64),
    Bytes(&'a [u8]),
}
fn varint(b: &[u8], i: &mut usize) -> Option<u64> {
    let mut v = 0u64;
    let mut shift = 0;
    while *i < b.len() {
        let x = b[*i];
        *i += 1;
        v |= ((x & 0x7f) as u64) << shift;
        if x & 0x80 == 0 {
            return Some(v);
        }
        shift += 7;
        if shift > 63 {
            return None;
        }
    }
    None
}
/// (field number, value) pairs at the top level of a message
fn pb_fields(b: &[u8]) -> Vec<(u64, Pb<'_>)> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let Some(key) = varint(b, &mut i) else { break };
        let (num, wt) = (key >> 3, key & 7);
        match wt {
            0 => match varint(b, &mut i) {
                Some(v) => out.push((num, Pb::Int(v))),
                None => break,
            },
            1 => i += 8,
            5 => i += 4,
            2 => {
                let Some(len) = varint(b, &mut i) else { break };
                let end = i + len as usize;
                if end > b.len() {
                    break;
                }
                out.push((num, Pb::Bytes(&b[i..end])));
                i = end;
            }
            _ => break,
        }
    }
    out
}
fn pb_str(b: &[u8], field: u64) -> String {
    pb_fields(b)
        .into_iter()
        .find_map(|(n, v)| match (n == field, v) {
            (true, Pb::Bytes(x)) => Some(String::from_utf8_lossy(x).into_owned()),
            _ => None,
        })
        .unwrap_or_default()
}
fn pb_int(b: &[u8], field: u64) -> u64 {
    pb_fields(b)
        .into_iter()
        .find_map(|(n, v)| match (n == field, v) {
            (true, Pb::Int(x)) => Some(x),
            _ => None,
        })
        .unwrap_or(0)
}

// ---- the collection --------------------------------------------------------------------------

fn has_table(c: &Connection, name: &str) -> bool {
    c.query_row("select count(*) from sqlite_master where type='table' and name=?1", [name], |r| r.get::<_, i64>(0))
        .map(|n| n > 0)
        .unwrap_or(false)
}

/// Note types and decks: tables in the newest schema, JSON in the `col` row before it.
fn types_and_decks(c: &Connection) -> Result<(Vec<Value>, Vec<Value>), String> {
    let e = |e: rusqlite::Error| e.to_string();
    if has_table(c, "notetypes") {
        let mut fields: HashMap<i64, Vec<(i64, String)>> = HashMap::new();
        let mut st = c.prepare("select ntid, ord, name from fields").map_err(e)?;
        for r in st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?))).map_err(e)? {
            let (nt, ord, name) = r.map_err(e)?;
            fields.entry(nt).or_default().push((ord, name));
        }
        let mut tmpls: HashMap<i64, Vec<(i64, Value)>> = HashMap::new();
        let mut st = c.prepare("select ntid, ord, name, config from templates").map_err(e)?;
        for r in st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?, r.get::<_, Vec<u8>>(3)?))).map_err(e)? {
            let (nt, ord, name, cfg) = r.map_err(e)?;
            tmpls.entry(nt).or_default().push((ord, json!({ "ord": ord, "name": name, "q": pb_str(&cfg, 1), "a": pb_str(&cfg, 2) })));
        }
        let mut types = Vec::new();
        let mut st = c.prepare("select id, name, config from notetypes").map_err(e)?;
        for r in st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, Vec<u8>>(2)?))).map_err(e)? {
            let (id, name, cfg) = r.map_err(e)?;
            let mut f = fields.remove(&id).unwrap_or_default();
            f.sort();
            let mut t = tmpls.remove(&id).unwrap_or_default();
            t.sort_by_key(|x| x.0);
            types.push(json!({
                "id": id.to_string(), "name": name,
                // Notetype.Config: 1 = kind (0 normal, 1 cloze)
                "cloze": pb_int(&cfg, 1) == 1,
                "fields": f.into_iter().map(|x| x.1).collect::<Vec<_>>(),
                "templates": t.into_iter().map(|x| x.1).collect::<Vec<_>>(),
            }));
        }
        let mut decks = Vec::new();
        let mut st = c.prepare("select id, name from decks").map_err(e)?;
        for r in st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))).map_err(e)? {
            let (id, name) = r.map_err(e)?;
            decks.push(json!({ "id": id.to_string(), "path": name.split('\u{1f}').collect::<Vec<_>>() }));
        }
        return Ok((types, decks));
    }
    let (models, decks): (String, String) = c.query_row("select models, decks from col", [], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?;
    let models: Value = serde_json::from_str(&models).map_err(|e| e.to_string())?;
    let decks: Value = serde_json::from_str(&decks).map_err(|e| e.to_string())?;
    let mut types = Vec::new();
    for (id, m) in models.as_object().into_iter().flatten() {
        let mut flds: Vec<(i64, String)> = m["flds"].as_array().into_iter().flatten().map(|f| (f["ord"].as_i64().unwrap_or(0), f["name"].as_str().unwrap_or("").to_string())).collect();
        flds.sort();
        let mut tm: Vec<Value> = m["tmpls"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|t| json!({ "ord": t["ord"].as_i64().unwrap_or(0), "name": t["name"], "q": t["qfmt"], "a": t["afmt"] }))
            .collect();
        tm.sort_by_key(|t| t["ord"].as_i64().unwrap_or(0));
        types.push(json!({ "id": id, "name": m["name"], "cloze": m["type"].as_i64() == Some(1), "fields": flds.into_iter().map(|x| x.1).collect::<Vec<_>>(), "templates": tm }));
    }
    let decks = decks
        .as_object()
        .into_iter()
        .flatten()
        .map(|(id, d)| json!({ "id": id, "path": d["name"].as_str().unwrap_or("").split("::").collect::<Vec<_>>() }))
        .collect();
    Ok((types, decks))
}

fn read_collection(db: &Path) -> Result<Value, String> {
    let e = |e: rusqlite::Error| e.to_string();
    let c = Connection::open_with_flags(db, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
    // Anki's own collation, needed by the indexes of the newest schema
    c.create_collation("unicase", |a: &str, b: &str| a.to_lowercase().cmp(&b.to_lowercase())).map_err(e)?;
    let crt: i64 = c.query_row("select crt from col", [], |r| r.get(0)).map_err(e)?;
    let (types, decks) = types_and_decks(&c)?;
    let mut notes = Vec::new();
    let mut st = c.prepare("select id, guid, mid, tags, flds from notes").map_err(e)?;
    for r in st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?))).map_err(e)? {
        let (id, guid, mid, tags, flds) = r.map_err(e)?;
        notes.push(json!({
            "id": id.to_string(), "guid": guid, "mid": mid.to_string(),
            "tags": tags.split_whitespace().collect::<Vec<_>>(),
            "fields": flds.split('\u{1f}').collect::<Vec<_>>(),
        }));
    }
    let mut cards = Vec::new();
    let mut st = c
        .prepare("select id, nid, did, odid, ord, type, queue, due, odue, ivl, factor, reps, lapses, data from cards")
        .map_err(e)?;
    let rows = st
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?.to_string(), "nid": r.get::<_, i64>(1)?.to_string(),
                "did": r.get::<_, i64>(2)?.to_string(), "odid": r.get::<_, i64>(3)?.to_string(),
                "ord": r.get::<_, i64>(4)?, "type": r.get::<_, i64>(5)?, "queue": r.get::<_, i64>(6)?,
                "due": r.get::<_, i64>(7)?, "odue": r.get::<_, i64>(8)?, "ivl": r.get::<_, i64>(9)?,
                "factor": r.get::<_, i64>(10)?, "reps": r.get::<_, i64>(11)?, "lapses": r.get::<_, i64>(12)?,
                "data": r.get::<_, String>(13).unwrap_or_default(),
            }))
        })
        .map_err(e)?;
    for r in rows {
        cards.push(r.map_err(e)?);
    }
    let mut revlog = Vec::new();
    let mut st = c.prepare("select id, cid, ease, ivl, time, type from revlog order by id").map_err(e)?;
    let rows = st
        .query_map([], |r| {
            Ok(json!({ "t": r.get::<_, i64>(0)?, "cid": r.get::<_, i64>(1)?.to_string(), "ease": r.get::<_, i64>(2)?, "ivl": r.get::<_, i64>(3)?, "ms": r.get::<_, i64>(4)?, "type": r.get::<_, i64>(5)? }))
        })
        .map_err(e)?;
    for r in rows {
        revlog.push(r.map_err(e)?);
    }
    Ok(json!({ "crt": crt, "types": types, "decks": decks, "notes": notes, "cards": cards, "revlog": revlog }))
}

/// Media index → (name, zip entry name). Newest format: zstd protobuf MediaEntries
/// { repeated MediaEntry entries = 1 } with MediaEntry { name = 1, size = 2, sha1 = 3 }, files
/// named by position; older: JSON {"0": "name.jpg"}.
fn media_index(bytes: &[u8]) -> Vec<(String, String)> {
    if let Ok(v) = serde_json::from_slice::<HashMap<String, String>>(bytes) {
        return v.into_iter().map(|(k, n)| (n, k)).collect();
    }
    let Ok(raw) = maybe_unzstd(bytes.to_vec()) else { return Vec::new() };
    pb_fields(&raw)
        .into_iter()
        .filter_map(|(n, v)| match (n, v) {
            (1, Pb::Bytes(e)) => Some(pb_str(e, 1)),
            _ => None,
        })
        .enumerate()
        .map(|(i, name)| (name, i.to_string()))
        .collect()
}

/// a file name that is safe in one folder
fn safe_name(n: &str) -> String {
    let s: String = n.chars().map(|c| if c == '/' || c == '\\' || c == ':' || c.is_control() { '_' } else { c }).collect();
    let s = s.trim_start_matches('.').trim().to_string();
    if s.is_empty() { "file".into() } else { s }
}

/// Unpack a package. `media_dir` (absolute) receives the media; returns the collection JSON
/// plus `media`: {name in the notes: path relative to `media_root`}.
pub fn read_package(bytes: &[u8], media_dir: Option<(&Path, &str)>) -> Result<Value, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| "That isn't an Anki package.".to_string())?;
    let mut entry = |name: &str| -> Option<Vec<u8>> {
        let mut f = zip.by_name(name).ok()?;
        let mut v = Vec::new();
        f.read_to_end(&mut v).ok()?;
        Some(v)
    };
    let db = entry("collection.anki21b")
        .map(|b| unzstd(&b))
        .transpose()?
        .or_else(|| entry("collection.anki21"))
        .or_else(|| entry("collection.anki2"))
        .ok_or("No collection in this package.")?;
    let index = entry("media").map(|m| media_index(&m)).unwrap_or_default();

    // SQLite reads from a file: a temporary one, removed again
    let tmp = std::env::temp_dir().join(format!("mosaic-anki-{}-{}.db", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
    std::fs::write(&tmp, &db).map_err(|e| e.to_string())?;
    let out = read_collection(&tmp);
    let _ = std::fs::remove_file(&tmp);
    let mut out = out?;

    let mut media = serde_json::Map::new();
    if let Some((dir, rel_prefix)) = media_dir {
        for (name, zname) in index {
            let Some(data) = entry(&zname) else { continue };
            let Ok(data) = maybe_unzstd(data) else { continue };
            let base = safe_name(&name);
            // same name and same bytes: reuse it; same name, other bytes: a numbered copy
            let mut file = base.clone();
            let mut k = 1;
            let target = loop {
                let p: PathBuf = dir.join(&file);
                match std::fs::read(&p) {
                    Ok(old) if old == data => break Some(p),
                    Ok(_) => {
                        k += 1;
                        let (stem, ext) = base.rsplit_once('.').map(|(a, b)| (a.to_string(), format!(".{b}"))).unwrap_or((base.clone(), String::new()));
                        file = format!("{stem} ({k}){ext}");
                    }
                    Err(_) => {
                        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
                        write_atomic(&p, &data)?;
                        break Some(p);
                    }
                }
            };
            if target.is_some() {
                media.insert(name, Value::String(format!("{rel_prefix}{file}")));
            }
        }
    }
    out["media"] = Value::Object(media);
    Ok(out)
}

/// Body: the package bytes. Media go to `<notes folder>/attachments/anki/`.
#[tauri::command]
pub async fn anki_read(state: State<'_, NotesState>, request: Request<'_>) -> Result<Value, String> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err("Expected the package's bytes".into()) };
    let bytes = bytes.clone();
    let root = root_of(&state).ok();
    tauri::async_runtime::spawn_blocking(move || {
        let dir = root.map(|r| r.join("attachments").join("anki"));
        read_package(&bytes, dir.as_deref().map(|d| (d, "attachments/anki/")))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// MOSAIC_APKG=<path to a package> cargo test anki -- --nocapture
    /// (her decks are personal data, so none is kept in the repo). Writes the JSON next to it.
    #[test]
    fn reads_a_package() {
        let Ok(path) = std::env::var("MOSAIC_APKG") else { return };
        let bytes = std::fs::read(&path).unwrap();
        let dir = std::env::temp_dir().join("mosaic-anki-media-test");
        let v = read_package(&bytes, Some((&dir, "attachments/anki/"))).unwrap();
        println!(
            "types {} decks {} notes {} cards {} revlog {} media {}",
            v["types"].as_array().unwrap().len(),
            v["decks"].as_array().unwrap().len(),
            v["notes"].as_array().unwrap().len(),
            v["cards"].as_array().unwrap().len(),
            v["revlog"].as_array().unwrap().len(),
            v["media"].as_object().unwrap().len()
        );
        assert!(!v["notes"].as_array().unwrap().is_empty());
        std::fs::write(format!("{path}.json"), serde_json::to_string_pretty(&v).unwrap()).unwrap();
    }

    #[test]
    fn protobuf_strings() {
        // field 1 = "ab", field 2 = varint 5, field 3 = "xyz"
        let b = [0x0a, 2, b'a', b'b', 0x10, 5, 0x1a, 3, b'x', b'y', b'z'];
        assert_eq!(pb_str(&b, 1), "ab");
        assert_eq!(pb_int(&b, 2), 5);
        assert_eq!(pb_str(&b, 3), "xyz");
    }
}
