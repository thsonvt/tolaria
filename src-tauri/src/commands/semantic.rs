use crate::search::SearchResponse;
use crate::semantic::{SemanticStatus, SemanticStatusStore};

#[tauri::command]
pub fn semantic_index_status() -> SemanticStatus {
    SemanticStatusStore::default().snapshot()
}

#[tauri::command]
pub async fn rebuild_semantic_index(_vault_path: String) -> Result<SemanticStatus, String> {
    Err("semantic rebuild is not implemented".to_string())
}

#[tauri::command]
pub async fn search_vault_semantic(
    _vault_path: String,
    _query: String,
    _limit: usize,
) -> Result<SearchResponse, String> {
    Err("semantic search is not implemented".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_command_starts_disabled() {
        let status = semantic_index_status();

        assert_eq!(status.enabled, false);
    }
}
