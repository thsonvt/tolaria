use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

const THOUGHTS_DIR: &str = ".tolaria/thoughts";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ThoughtAnchor {
    Selection {
        quote: String,
        prefix: String,
        suffix: String,
        start_offset: usize,
        end_offset: usize,
    },
    Article,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThoughtRecord {
    pub id: String,
    pub note_path: String,
    pub note_title: String,
    pub anchor: ThoughtAnchor,
    pub body_markdown: String,
    pub created_at: String,
    pub updated_at: String,
}

fn note_path_hex(note_path: &str) -> String {
    note_path
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn ensure_non_empty(value: &str, field: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("Thought {field} cannot be empty"));
    }
    Ok(())
}

pub fn thought_sidecar_path(vault_path: &Path, note_path: &str) -> Result<PathBuf, String> {
    ensure_non_empty(note_path, "note path")?;
    Ok(vault_path
        .join(THOUGHTS_DIR)
        .join(format!("{}.json", note_path_hex(note_path))))
}

fn read_thought_file(path: &Path) -> Result<Vec<ThoughtRecord>, String> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!(
                "Failed to read thought file {}: {}",
                path.display(),
                error
            ));
        }
    };

    serde_json::from_str(&contents)
        .map_err(|error| format!("Failed to parse thought file {}: {}", path.display(), error))
}

fn write_thought_file(path: &Path, thoughts: &[ThoughtRecord]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create thought directory {}: {}",
                parent.display(),
                error
            )
        })?;
    }

    let contents = serde_json::to_string_pretty(thoughts)
        .map_err(|error| format!("Failed to serialize thoughts: {}", error))?;
    fs::write(path, contents)
        .map_err(|error| format!("Failed to write thought file {}: {}", path.display(), error))
}

pub fn read_note_thoughts(
    vault_path: &Path,
    note_path: &str,
) -> Result<Vec<ThoughtRecord>, String> {
    let path = thought_sidecar_path(vault_path, note_path)?;
    read_thought_file(&path)
}

pub fn save_thought(vault_path: &Path, thought: ThoughtRecord) -> Result<ThoughtRecord, String> {
    ensure_non_empty(&thought.id, "id")?;
    ensure_non_empty(&thought.note_path, "note path")?;
    ensure_non_empty(&thought.body_markdown, "body")?;

    let path = thought_sidecar_path(vault_path, &thought.note_path)?;
    let mut thoughts = read_thought_file(&path)?;

    if let Some(index) = thoughts
        .iter()
        .position(|existing| existing.id == thought.id)
    {
        thoughts[index] = thought.clone();
    } else {
        thoughts.push(thought.clone());
    }

    write_thought_file(&path, &thoughts)?;
    Ok(thought)
}

pub fn delete_thought(vault_path: &Path, note_path: &str, thought_id: &str) -> Result<(), String> {
    ensure_non_empty(note_path, "note path")?;
    ensure_non_empty(thought_id, "id")?;

    let path = thought_sidecar_path(vault_path, note_path)?;
    let mut thoughts = read_thought_file(&path)?;
    thoughts.retain(|thought| thought.id != thought_id);

    if thoughts.is_empty() {
        if path.exists() {
            fs::remove_file(&path).map_err(|error| {
                format!(
                    "Failed to delete thought file {}: {}",
                    path.display(),
                    error
                )
            })?;
        }
        return Ok(());
    }

    write_thought_file(&path, &thoughts)
}

pub fn list_thoughts(vault_path: &Path) -> Result<Vec<ThoughtRecord>, String> {
    let thoughts_dir = vault_path.join(THOUGHTS_DIR);
    if !thoughts_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&thoughts_dir).map_err(|error| {
        format!(
            "Failed to read thoughts directory {}: {}",
            thoughts_dir.display(),
            error
        )
    })?;

    let mut thoughts = Vec::new();
    for entry in entries {
        let path = entry
            .map_err(|error| format!("Failed to read thought entry: {}", error))?
            .path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }

        let mut note_thoughts = read_thought_file(&path)?;
        thoughts.append(&mut note_thoughts);
    }

    thoughts.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(thoughts)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_thought(id: &str, body: &str) -> ThoughtRecord {
        ThoughtRecord {
            id: id.to_string(),
            note_path: "Articles/the-context-and-the-harness.md".to_string(),
            note_title: "The Context and the Harness".to_string(),
            anchor: ThoughtAnchor::Selection {
                quote: "Retrieved documents are where context engineering intersects".to_string(),
                prefix: "The trade-off with few-shot examples".to_string(),
                suffix: "formation retrieval".to_string(),
                start_offset: 120,
                end_offset: 181,
            },
            body_markdown: body.to_string(),
            created_at: "2026-05-03T08:00:00.000Z".to_string(),
            updated_at: "2026-05-03T08:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn thought_sidecar_path_uses_hex_note_path_inside_tolaria_directory() {
        let root = Path::new("/vault");
        let path = thought_sidecar_path(root, "Articles/the-context-and-the-harness.md").unwrap();
        assert_eq!(
            path,
            root.join(".tolaria/thoughts/41727469636c65732f7468652d636f6e746578742d616e642d7468652d6861726e6573732e6d64.json"),
        );
    }

    #[test]
    fn save_read_and_delete_round_trip_one_note_thought_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let first = sample_thought("thought-1", "This is about retrieval quality.");
        let second = sample_thought("thought-2", "This belongs beside the same passage.");

        save_thought(dir.path(), first.clone()).unwrap();
        save_thought(dir.path(), second.clone()).unwrap();

        let thoughts = read_note_thoughts(dir.path(), &first.note_path).unwrap();
        assert_eq!(thoughts, vec![first.clone(), second.clone()]);

        delete_thought(dir.path(), &first.note_path, &first.id).unwrap();
        assert_eq!(
            read_note_thoughts(dir.path(), &first.note_path).unwrap(),
            vec![second]
        );
    }

    #[test]
    fn delete_thought_removes_sidecar_when_last_record_is_deleted() {
        let dir = tempfile::TempDir::new().unwrap();
        let thought = sample_thought("thought-1", "Only thought in the sidecar.");
        let sidecar_path = thought_sidecar_path(dir.path(), &thought.note_path).unwrap();

        save_thought(dir.path(), thought.clone()).unwrap();
        assert!(sidecar_path.exists());

        delete_thought(dir.path(), &thought.note_path, &thought.id).unwrap();

        assert!(!sidecar_path.exists());
        assert_eq!(
            read_note_thoughts(dir.path(), &thought.note_path).unwrap(),
            Vec::new()
        );
    }

    #[test]
    fn list_thoughts_returns_an_error_for_malformed_json() {
        let dir = tempfile::TempDir::new().unwrap();
        let thought = sample_thought("thought-1", "Valid thought.");
        save_thought(dir.path(), thought.clone()).unwrap();
        std::fs::write(dir.path().join(".tolaria/thoughts/bad.json"), "{not-json").unwrap();

        let err = list_thoughts(dir.path()).unwrap_err();
        assert!(err.contains("Failed to parse thought file"));
        assert!(err.contains("bad.json"));
    }
}
