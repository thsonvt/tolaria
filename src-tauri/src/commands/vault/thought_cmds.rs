use crate::vault::thoughts::{self, ThoughtRecord};
use std::path::{Path, PathBuf};

use super::boundary::{with_requested_root, ACTIVE_VAULT_PATH_ERROR};

fn with_thought_root<T>(
    vault_path: PathBuf,
    action: impl FnOnce(&Path) -> Result<T, String>,
) -> Result<T, String> {
    if !vault_path.as_os_str().is_empty() && !vault_path.is_absolute() {
        return Err(ACTIVE_VAULT_PATH_ERROR.to_string());
    }

    let raw_vault_path = vault_path.to_string_lossy();
    with_requested_root(raw_vault_path.as_ref(), |requested_root| {
        action(Path::new(requested_root))
    })
}

#[tauri::command]
pub fn list_thoughts(vault_path: PathBuf) -> Result<Vec<ThoughtRecord>, String> {
    with_thought_root(vault_path, thoughts::list_thoughts)
}

#[tauri::command]
pub fn read_note_thoughts(
    vault_path: PathBuf,
    note_path: String,
) -> Result<Vec<ThoughtRecord>, String> {
    with_thought_root(vault_path, |requested_root| {
        thoughts::read_note_thoughts(requested_root, &note_path)
    })
}

#[tauri::command]
pub fn save_thought(vault_path: PathBuf, thought: ThoughtRecord) -> Result<ThoughtRecord, String> {
    with_thought_root(vault_path, |requested_root| {
        thoughts::save_thought(requested_root, thought)
    })
}

#[tauri::command]
pub fn delete_thought(
    vault_path: PathBuf,
    note_path: String,
    thought_id: String,
) -> Result<(), String> {
    with_thought_root(vault_path, |requested_root| {
        thoughts::delete_thought(requested_root, &note_path, &thought_id)
    })
}
