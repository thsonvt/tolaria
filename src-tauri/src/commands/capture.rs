//! Tauri commands for capturing external content into the active vault.

use std::path::{Path, PathBuf};

use chrono::Utc;

use crate::capture::{extract, fetch, frontmatter, url};

use super::VaultBoundary;

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("invalid url: {0}")]
    Url(String),
    #[error("fetch failed: {0}")]
    Fetch(String),
    #[error("extraction failed: {0}")]
    Extract(String),
    #[error("write failed: {0}")]
    Write(String),
    #[error("note already exists at {0}")]
    AlreadyExists(String),
    #[error("{0}")]
    Vault(String),
}

pub async fn capture_url_inner(vault_root: &Path, raw_url: &str) -> Result<PathBuf, CaptureError> {
    let normalized = url::validate(raw_url).map_err(|e| CaptureError::Url(e.to_string()))?;
    let fetched = fetch::fetch(&normalized)
        .await
        .map_err(|e| CaptureError::Fetch(e.to_string()))?;
    let article = extract::extract(&fetched.html, &fetched.final_url)
        .map_err(|e| CaptureError::Extract(e.to_string()))?;
    let doc = frontmatter::render(&article, &fetched.final_url, Utc::now());
    write_capture_document(vault_root, &doc)
}

fn write_capture_document(
    vault_root: &Path,
    doc: &frontmatter::CaptureDocument,
) -> Result<PathBuf, CaptureError> {
    let target = vault_root.join(&doc.filename);
    if target.exists() {
        return Err(CaptureError::AlreadyExists(target.display().to_string()));
    }
    std::fs::write(&target, &doc.contents).map_err(|e| CaptureError::Write(e.to_string()))?;
    Ok(target)
}

#[tauri::command]
pub async fn capture_url(url: String, vault_path: Option<PathBuf>) -> Result<String, String> {
    let raw_vault_path = vault_path
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned());
    let boundary = VaultBoundary::from_request(raw_vault_path.as_deref())
        .map_err(|e| CaptureError::Vault(e).to_string())?;
    capture_url_inner(boundary.requested_root(), &url)
        .await
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn mount_article(server: &MockServer) {
        let html = include_str!("../../tests/fixtures/article-substack.html");
        Mock::given(method("GET"))
            .and(path("/post"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(html.as_bytes(), "text/html"))
            .mount(server)
            .await;
    }

    #[tokio::test]
    async fn writes_capture_note_to_vault_root() {
        let server = MockServer::start().await;
        mount_article(&server).await;
        let dir = tempfile::tempdir().unwrap();
        let url = format!("{}/post", server.uri());

        let written = capture_url_inner(dir.path(), &url).await.unwrap();
        assert!(written.exists());
        let body = std::fs::read_to_string(&written).unwrap();
        assert!(body.contains("type: Capture"));
        assert!(body.contains("source: web"));
        assert!(body.contains(&url));
    }

    #[tokio::test]
    async fn refuses_to_overwrite_existing_note() {
        let server = MockServer::start().await;
        mount_article(&server).await;
        let dir = tempfile::tempdir().unwrap();
        let url = format!("{}/post", server.uri());

        capture_url_inner(dir.path(), &url).await.unwrap();
        let err = capture_url_inner(dir.path(), &url).await.unwrap_err();
        assert!(matches!(err, CaptureError::AlreadyExists(_)));
    }
}
