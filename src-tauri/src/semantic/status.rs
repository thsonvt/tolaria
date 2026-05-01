use serde::Serialize;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SemanticIndexState {
    Disabled,
    NotReady,
    Indexing,
    Ready,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SemanticStatus {
    pub enabled: bool,
    pub model_ready: bool,
    pub index_state: SemanticIndexState,
    pub indexed_notes: usize,
    pub total_notes: usize,
    pub message: Option<String>,
}

#[derive(Clone, Default)]
pub struct SemanticStatusStore {
    inner: Arc<Mutex<SemanticStatus>>,
}

impl Default for SemanticStatus {
    fn default() -> Self {
        Self {
            enabled: false,
            model_ready: false,
            index_state: SemanticIndexState::Disabled,
            indexed_notes: 0,
            total_notes: 0,
            message: None,
        }
    }
}

impl SemanticStatusStore {
    pub fn snapshot(&self) -> SemanticStatus {
        self.inner
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    pub fn update(&self, next: SemanticStatus) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = next;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_status_is_disabled() {
        let store = SemanticStatusStore::default();

        assert_eq!(store.snapshot().enabled, false);
        assert_eq!(store.snapshot().index_state, SemanticIndexState::Disabled);
    }

    #[test]
    fn update_replaces_snapshot() {
        let store = SemanticStatusStore::default();

        store.update(SemanticStatus {
            enabled: true,
            model_ready: true,
            index_state: SemanticIndexState::Ready,
            indexed_notes: 3,
            total_notes: 3,
            message: None,
        });

        assert_eq!(store.snapshot().indexed_notes, 3);
        assert_eq!(store.snapshot().index_state, SemanticIndexState::Ready);
    }
}
