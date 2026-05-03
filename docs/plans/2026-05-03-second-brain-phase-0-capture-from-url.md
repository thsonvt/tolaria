# Second-Brain Phase 0 — Capture from Generic Web URL

> **For implementers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a user paste a generic web article URL into Tolaria and produce a new `Capture` note in the vault, populated with the extracted article body and the agreed frontmatter shape — with no LLM enrichment, no source-specific extractors, and no chat panel.

**Architecture:** Rust backend fetches the URL (avoids CORS), runs the `readability` crate to isolate the article body, converts the body to Markdown with `htmd`, formats frontmatter with `gray_matter`-friendly YAML, and writes the file via the existing vault file-write path. Frontend exposes a single shadcn Dialog ("Capture from URL") plus a menu entry; no changes to the existing Cmd+N flow.

**Tech Stack:** Rust (Tauri 2 backend), TypeScript (React + Vitest), Tauri commands as the FFI boundary, Playwright for one smoke test, `readability` + `htmd` + `reqwest` as new Rust deps.

**Reference design:** `docs/plans/2026-05-03-second-brain-design.md` (committed as `172aea13`).

**Project constraints (AGENTS.md, do not violate):**
- Work directly on `main`. No branches.
- TDD: red → green → refactor → commit. One task per commit.
- Every touched code file's CodeScene file score must improve, or stay at `10.0` if already there. Every new code file must reach `10.0` before commit.
- No `eslint-disable`, no `#[allow(...)]`, no `as any`.
- Default to `demo-vault-v2/` for QA.

---

## Task 0: Verify pre-state is clean

**Step 1: Confirm working tree state matches expectations**

Run:
```bash
git status --short
git log -1 --format='%h %s'
```
Expected: HEAD is `172aea13 Capture second-brain UI design from brainstorm`. The only staged-or-modified files are pre-existing state files (`.omx/state/*`, etc.) and the untracked `.superpowers/brainstorm/...` directory. None of those will be committed during this plan.

**Step 2: Confirm CodeScene baseline**

Run:
```bash
cat .codescene-thresholds
```
Capture the current Hotspot and Average values so post-task pushes can verify the gate held or improved.

No commit for Task 0.

---

## Task 1: Define the `Capture` type in both demo vaults

**Files:**
- Create: `demo-vault-v2/type/capture.md`
- Create: `demo-vault/type/capture.md`

**Step 1: Write the type file (demo-vault-v2)**

Use the same convention as `demo-vault-v2/type/note.md` (already on disk — read it first to match field order exactly).

```markdown
---
type: Type
icon: download-simple
color: amber
sidebar label: Captures
---

# Capture

Captures store external content brought into the vault — articles, videos, PDFs, slide decks, Gists. Each Capture preserves the original source URL, an extracted summary, and the full content body. Your own thoughts attach via the existing thoughts sidecar.
```

**Step 2: Mirror the file into demo-vault**

```bash
cp demo-vault-v2/type/capture.md demo-vault/type/capture.md
```

**Step 3: Manual verification**

Run `pnpm tauri dev`, wait 10 seconds, focus the app, and confirm "Captures" appears in the type sidebar of `demo-vault-v2`. No code changed; no automated test required for a markdown content file.

**Step 4: Commit**

```bash
git add demo-vault-v2/type/capture.md demo-vault/type/capture.md
git commit -m "feat(vault): define Capture type for second-brain ingestion"
```

---

## Task 2: Add Rust dependencies for URL fetch + article extraction

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add the three deps**

Append to `[dependencies]`:

```toml
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "gzip", "brotli", "deflate"] }
readability = "0.3"
htmd = "0.2"
```

(Use the latest patch versions cargo resolves. `readability` and `htmd` are pure-Rust; `reqwest` with `rustls-tls` avoids a system OpenSSL dependency.)

**Step 2: Verify compilation**

```bash
cd src-tauri && cargo check
```
Expected: clean compile, no warnings.

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "build: add reqwest, readability, htmd for URL captures"
```

---

## Task 3: Backend module skeleton + URL validation (TDD)

**Files:**
- Create: `src-tauri/src/capture/mod.rs`
- Create: `src-tauri/src/capture/url.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod capture;`)

**Step 1: Write the failing test**

Create `src-tauri/src/capture/url.rs`:

```rust
//! URL validation for capture ingestion.

use std::fmt;

#[derive(Debug, PartialEq, Eq)]
pub enum UrlError {
    Empty,
    InvalidScheme,
    Malformed,
}

impl fmt::Display for UrlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UrlError::Empty => write!(f, "URL is empty"),
            UrlError::InvalidScheme => write!(f, "URL must be http or https"),
            UrlError::Malformed => write!(f, "URL is malformed"),
        }
    }
}

pub fn validate(raw: &str) -> Result<String, UrlError> {
    todo!("implement in step 3")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty() {
        assert_eq!(validate(""), Err(UrlError::Empty));
        assert_eq!(validate("   "), Err(UrlError::Empty));
    }

    #[test]
    fn rejects_non_http_schemes() {
        assert_eq!(validate("ftp://example.com"), Err(UrlError::InvalidScheme));
        assert_eq!(validate("file:///etc/passwd"), Err(UrlError::InvalidScheme));
    }

    #[test]
    fn rejects_malformed() {
        assert_eq!(validate("not a url"), Err(UrlError::Malformed));
    }

    #[test]
    fn accepts_https_and_normalizes_whitespace() {
        assert_eq!(validate("  https://example.com/post  ").unwrap(), "https://example.com/post");
    }

    #[test]
    fn accepts_http() {
        assert_eq!(validate("http://example.com").unwrap(), "http://example.com/");
    }
}
```

Create `src-tauri/src/capture/mod.rs`:

```rust
pub mod url;
```

Modify `src-tauri/src/lib.rs` — add `pub mod capture;` next to the other top-level module declarations.

**Step 2: Run the tests, see them fail**

```bash
cd src-tauri && cargo test --lib capture::url
```
Expected: 5 tests fail with "not yet implemented".

**Step 3: Implement `validate`**

Replace the `todo!` with:

```rust
pub fn validate(raw: &str) -> Result<String, UrlError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(UrlError::Empty);
    }
    let parsed = ::url::Url::parse(trimmed).map_err(|_| UrlError::Malformed)?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        _ => Err(UrlError::InvalidScheme),
    }
}
```

This requires the `url` crate. Add to `Cargo.toml` dependencies:
```toml
url = "2"
```

(`reqwest` already pulls in `url` transitively, but declare it directly because we use it in the public-ish path.)

**Step 4: Run tests, see them pass**

```bash
cargo test --lib capture::url
```
Expected: 5 passed.

**Step 5: CodeScene check**

Run `mcp__codescene__code_health_score` on `src-tauri/src/capture/url.rs`. New file must reach 10.0. If it doesn't, refactor (likely splitting the `Display` impl into a smaller match or extracting the scheme check) before committing.

**Step 6: Commit**

```bash
git add src-tauri/src/capture/ src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(capture): validate http(s) URLs before fetching"
```

---

## Task 4: Backend HTTP fetcher with size cap (TDD)

**Files:**
- Create: `src-tauri/src/capture/fetch.rs`
- Modify: `src-tauri/src/capture/mod.rs` (add `pub mod fetch;`)

**Step 1: Write the failing test**

Create `src-tauri/src/capture/fetch.rs`:

```rust
//! HTTP fetching for URL captures with a hard size cap.

use std::time::Duration;

const MAX_BYTES: usize = 5 * 1024 * 1024; // 5 MiB
const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, thiserror::Error)]
pub enum FetchError {
    #[error("network error: {0}")]
    Network(String),
    #[error("response too large (over 5 MiB)")]
    TooLarge,
    #[error("non-success status: {0}")]
    BadStatus(u16),
    #[error("response is not html: {0}")]
    NotHtml(String),
}

pub struct FetchedHtml {
    pub html: String,
    pub final_url: String,
}

pub async fn fetch(url: &str) -> Result<FetchedHtml, FetchError> {
    todo!("implement in step 3")
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn fetches_html_body() {
        let server = MockServer::start().await;
        Mock::given(method("GET")).and(path("/post"))
            .respond_with(ResponseTemplate::new(200)
                .insert_header("content-type", "text/html; charset=utf-8")
                .set_body_string("<html><body><h1>Hi</h1></body></html>"))
            .mount(&server).await;

        let result = fetch(&format!("{}/post", server.uri())).await.unwrap();
        assert!(result.html.contains("<h1>Hi</h1>"));
    }

    #[tokio::test]
    async fn rejects_non_html_content_type() {
        let server = MockServer::start().await;
        Mock::given(method("GET")).and(path("/feed.xml"))
            .respond_with(ResponseTemplate::new(200)
                .insert_header("content-type", "application/xml")
                .set_body_string("<rss></rss>"))
            .mount(&server).await;

        let err = fetch(&format!("{}/feed.xml", server.uri())).await.unwrap_err();
        assert!(matches!(err, FetchError::NotHtml(_)));
    }

    #[tokio::test]
    async fn rejects_4xx_5xx() {
        let server = MockServer::start().await;
        Mock::given(method("GET")).and(path("/missing"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server).await;

        let err = fetch(&format!("{}/missing", server.uri())).await.unwrap_err();
        assert!(matches!(err, FetchError::BadStatus(404)));
    }

    #[tokio::test]
    async fn rejects_oversize_responses() {
        let server = MockServer::start().await;
        let big = "<html>".to_string() + &"a".repeat(MAX_BYTES + 1) + "</html>";
        Mock::given(method("GET")).and(path("/big"))
            .respond_with(ResponseTemplate::new(200)
                .insert_header("content-type", "text/html")
                .set_body_string(big))
            .mount(&server).await;

        let err = fetch(&format!("{}/big", server.uri())).await.unwrap_err();
        assert!(matches!(err, FetchError::TooLarge));
    }
}
```

Add to `src-tauri/Cargo.toml` `[dependencies]`:
```toml
thiserror = "1"
```
And to `[dev-dependencies]`:
```toml
wiremock = "0.6"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

**Step 2: Run, see fail**

```bash
cargo test --lib capture::fetch
```
Expected: 4 tests fail to compile or fail at `todo!`.

**Step 3: Implement `fetch`**

```rust
pub async fn fetch(url: &str) -> Result<FetchedHtml, FetchError> {
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent("Tolaria/0.1 (+https://github.com/...)")
        .build()
        .map_err(|e| FetchError::Network(e.to_string()))?;

    let response = client.get(url).send().await
        .map_err(|e| FetchError::Network(e.to_string()))?;

    if !response.status().is_success() {
        return Err(FetchError::BadStatus(response.status().as_u16()));
    }

    let final_url = response.url().to_string();
    let content_type = response.headers().get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !content_type.contains("html") {
        return Err(FetchError::NotHtml(content_type));
    }

    if let Some(len) = response.content_length() {
        if (len as usize) > MAX_BYTES {
            return Err(FetchError::TooLarge);
        }
    }

    let bytes = response.bytes().await
        .map_err(|e| FetchError::Network(e.to_string()))?;
    if bytes.len() > MAX_BYTES {
        return Err(FetchError::TooLarge);
    }

    let html = String::from_utf8_lossy(&bytes).into_owned();
    Ok(FetchedHtml { html, final_url })
}
```

**Step 4: Run, see pass**

```bash
cargo test --lib capture::fetch
```
Expected: 4 passed.

**Step 5: CodeScene check on `fetch.rs`** — must hit 10.0. The 30-line `fetch` body is borderline; if it scores below 10.0, extract the response-checks (status, content-type, size) into named helpers.

**Step 6: Commit**

```bash
git add src-tauri/src/capture/fetch.rs src-tauri/src/capture/mod.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(capture): fetch HTML with size cap and content-type guard"
```

---

## Task 5: Backend article extraction (TDD)

**Files:**
- Create: `src-tauri/src/capture/extract.rs`
- Create: `src-tauri/tests/fixtures/article-substack.html` (minimal Substack-shaped fixture)
- Create: `src-tauri/tests/fixtures/article-medium.html` (minimal Medium-shaped fixture)
- Modify: `src-tauri/src/capture/mod.rs`

**Step 1: Write the failing test**

```rust
//! HTML → article extraction via the `readability` crate.

#[derive(Debug, Clone)]
pub struct ExtractedArticle {
    pub title: String,
    pub byline: Option<String>,
    pub body_markdown: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ExtractError {
    #[error("readability failed: {0}")]
    Readability(String),
    #[error("article body is empty")]
    Empty,
}

pub fn extract(html: &str, base_url: &str) -> Result<ExtractedArticle, ExtractError> {
    todo!("step 3")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        std::fs::read_to_string(format!("tests/fixtures/{}", name)).unwrap()
    }

    #[test]
    fn extracts_title_and_body_from_substack() {
        let html = fixture("article-substack.html");
        let article = extract(&html, "https://example.substack.com/p/post").unwrap();
        assert_eq!(article.title, "How to Think About Knowledge");
        assert!(article.body_markdown.contains("# Section One"));
        assert!(article.body_markdown.contains("evergreen note"));
    }

    #[test]
    fn captures_byline_when_present() {
        let html = fixture("article-medium.html");
        let article = extract(&html, "https://medium.com/@author/post").unwrap();
        assert_eq!(article.byline.as_deref(), Some("Jane Doe"));
    }

    #[test]
    fn rejects_empty_body() {
        let err = extract("<html><body></body></html>", "https://example.com").unwrap_err();
        assert!(matches!(err, ExtractError::Empty));
    }
}
```

Build the two fixture files by hand — each one a small HTML document with a clear article structure (title in `<h1>` or `<title>`, body in a `<main>` or `<article>` tag, optional `<meta name="author">`). Keep each fixture under 100 lines. Reference the readability crate's behavior: it expects either Open Graph metadata or standard semantic HTML.

**Step 2: Run, see fail**

```bash
cargo test --lib capture::extract
```
Expected: 3 tests fail.

**Step 3: Implement `extract`**

```rust
use readability::extractor;
use url::Url;

pub fn extract(html: &str, base_url: &str) -> Result<ExtractedArticle, ExtractError> {
    let url = Url::parse(base_url).map_err(|e| ExtractError::Readability(e.to_string()))?;
    let mut cursor = std::io::Cursor::new(html);
    let product = extractor::extract(&mut cursor, &url)
        .map_err(|e| ExtractError::Readability(e.to_string()))?;

    let body_markdown = htmd::convert(&product.content)
        .map_err(|e| ExtractError::Readability(e.to_string()))?;
    let trimmed = body_markdown.trim();
    if trimmed.is_empty() {
        return Err(ExtractError::Empty);
    }

    Ok(ExtractedArticle {
        title: product.title,
        byline: extract_byline(html),
        body_markdown: trimmed.to_string(),
    })
}

fn extract_byline(html: &str) -> Option<String> {
    let needle = r#"<meta name="author" content=""#;
    let start = html.find(needle)? + needle.len();
    let rest = &html[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}
```

(The `readability` crate's exact API may differ — verify by reading `cargo doc --open -p readability` after `cargo add`. The function signature in this plan reflects the most common shape; the engineer must adjust to match the version actually resolved by Cargo.)

**Step 4: Run, see pass**

```bash
cargo test --lib capture::extract
```
Expected: 3 passed.

**Step 5: CodeScene check** on `extract.rs`. The two functions are short — should easily score 10.0. If `extract` is borderline, split the markdown-conversion step out.

**Step 6: Commit**

```bash
git add src-tauri/src/capture/extract.rs src-tauri/tests/fixtures/ src-tauri/src/capture/mod.rs
git commit -m "feat(capture): extract article body and byline as markdown"
```

---

## Task 6: Backend frontmatter formatter (TDD)

**Files:**
- Create: `src-tauri/src/capture/frontmatter.rs`
- Modify: `src-tauri/src/capture/mod.rs`

**Step 1: Write the failing test**

```rust
//! Compose the markdown frontmatter and body for a new Capture note.

use crate::capture::extract::ExtractedArticle;
use chrono::{DateTime, Utc};

pub struct CaptureDocument {
    pub filename: String,    // safe slug-derived filename, .md included
    pub contents: String,    // full file body (frontmatter + content)
}

pub fn render(article: &ExtractedArticle, source_url: &str, captured_at: DateTime<Utc>) -> CaptureDocument {
    todo!("step 3")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::extract::ExtractedArticle;
    use chrono::TimeZone;

    fn sample() -> ExtractedArticle {
        ExtractedArticle {
            title: "How to Think About Knowledge".into(),
            byline: Some("Jane Doe".into()),
            body_markdown: "# Section One\n\nAn evergreen note is...".into(),
        }
    }

    #[test]
    fn renders_filename_from_title_slug() {
        let doc = render(&sample(), "https://example.com/post",
            Utc.with_ymd_and_hms(2026, 5, 3, 22, 14, 0).unwrap());
        assert_eq!(doc.filename, "how-to-think-about-knowledge.md");
    }

    #[test]
    fn renders_frontmatter_with_all_fields() {
        let doc = render(&sample(), "https://example.com/post",
            Utc.with_ymd_and_hms(2026, 5, 3, 22, 14, 0).unwrap());
        assert!(doc.contents.starts_with("---\n"));
        assert!(doc.contents.contains("type: Capture\n"));
        assert!(doc.contents.contains("source: web\n"));
        assert!(doc.contents.contains("url: https://example.com/post\n"));
        assert!(doc.contents.contains("title: How to Think About Knowledge\n"));
        assert!(doc.contents.contains("author: Jane Doe\n"));
        assert!(doc.contents.contains("captured_at: 2026-05-03T22:14:00Z\n"));
    }

    #[test]
    fn renders_body_after_frontmatter() {
        let doc = render(&sample(), "https://example.com/post", Utc::now());
        assert!(doc.contents.contains("# How to Think About Knowledge"));
        assert!(doc.contents.contains("# Section One"));
    }

    #[test]
    fn omits_author_field_when_byline_missing() {
        let mut a = sample();
        a.byline = None;
        let doc = render(&a, "https://example.com/post", Utc::now());
        assert!(!doc.contents.contains("author:"));
    }

    #[test]
    fn falls_back_to_captured_at_for_filename_when_title_is_empty() {
        let mut a = sample();
        a.title = "".into();
        let doc = render(&a, "https://example.com/post",
            Utc.with_ymd_and_hms(2026, 5, 3, 22, 14, 0).unwrap());
        assert_eq!(doc.filename, "capture-2026-05-03-221400.md");
    }
}
```

**Step 2: Run, see fail**

```bash
cargo test --lib capture::frontmatter
```
Expected: 5 tests fail.

**Step 3: Implement `render` plus a small `slugify` helper**

```rust
pub fn render(article: &ExtractedArticle, source_url: &str, captured_at: DateTime<Utc>) -> CaptureDocument {
    CaptureDocument {
        filename: filename_for(&article.title, captured_at),
        contents: contents_for(article, source_url, captured_at),
    }
}

fn filename_for(title: &str, captured_at: DateTime<Utc>) -> String {
    let slug = slugify(title);
    if slug.is_empty() {
        return format!("capture-{}.md", captured_at.format("%Y-%m-%d-%H%M%S"));
    }
    format!("{}.md", slug)
}

fn slugify(input: &str) -> String {
    input.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn contents_for(article: &ExtractedArticle, source_url: &str, captured_at: DateTime<Utc>) -> String {
    let mut out = String::from("---\n");
    out.push_str("type: Capture\n");
    out.push_str("source: web\n");
    out.push_str(&format!("url: {}\n", source_url));
    out.push_str(&format!("title: {}\n", article.title));
    if let Some(author) = &article.byline {
        out.push_str(&format!("author: {}\n", author));
    }
    out.push_str(&format!("captured_at: {}\n", captured_at.format("%Y-%m-%dT%H:%M:%SZ")));
    out.push_str("---\n\n");
    out.push_str(&format!("# {}\n\n", article.title));
    out.push_str(&article.body_markdown);
    out.push('\n');
    out
}
```

**Step 4: Run, see pass**

```bash
cargo test --lib capture::frontmatter
```
Expected: 5 passed.

**Step 5: CodeScene check.** If `contents_for` scores below 10.0 (long string-building tends to), extract a `Frontmatter` builder struct or use `serde_yaml::to_string` over a strongly-typed struct.

**Step 6: Commit**

```bash
git add src-tauri/src/capture/frontmatter.rs src-tauri/src/capture/mod.rs
git commit -m "feat(capture): render frontmatter + body for Capture notes"
```

---

## Task 7: Backend Tauri command `capture_url` (TDD)

**Files:**
- Create: `src-tauri/src/commands/capture.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (register the command in the invoke handler)

**Step 1: Write the failing test**

The command composes `validate → fetch → extract → render → write`. Test the composition with a `wiremock` server for the fetch step and a `tempfile::TempDir` as the vault root.

```rust
//! Tauri command: capture a URL into the vault as a Capture note.

use crate::capture::{extract, fetch, frontmatter, url};
use std::path::{Path, PathBuf};
use chrono::Utc;

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
}

pub async fn capture_url_inner(vault_root: &Path, raw_url: &str) -> Result<PathBuf, CaptureError> {
    todo!("step 3")
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn writes_capture_note_to_vault_root() {
        let server = MockServer::start().await;
        let html = include_str!("../../tests/fixtures/article-substack.html");
        Mock::given(method("GET")).and(path("/post"))
            .respond_with(ResponseTemplate::new(200)
                .insert_header("content-type", "text/html")
                .set_body_string(html))
            .mount(&server).await;

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
        let html = include_str!("../../tests/fixtures/article-substack.html");
        Mock::given(method("GET")).and(path("/post"))
            .respond_with(ResponseTemplate::new(200)
                .insert_header("content-type", "text/html")
                .set_body_string(html))
            .mount(&server).await;

        let dir = tempfile::tempdir().unwrap();
        let url = format!("{}/post", server.uri());

        capture_url_inner(dir.path(), &url).await.unwrap();
        let err = capture_url_inner(dir.path(), &url).await.unwrap_err();
        assert!(matches!(err, CaptureError::AlreadyExists(_)));
    }
}
```

**Step 2: Run, see fail**

```bash
cargo test --lib commands::capture
```
Expected: 2 tests fail.

**Step 3: Implement `capture_url_inner`**

```rust
pub async fn capture_url_inner(vault_root: &Path, raw_url: &str) -> Result<PathBuf, CaptureError> {
    let normalized = url::validate(raw_url).map_err(|e| CaptureError::Url(e.to_string()))?;
    let fetched = fetch::fetch(&normalized).await.map_err(|e| CaptureError::Fetch(e.to_string()))?;
    let article = extract::extract(&fetched.html, &fetched.final_url)
        .map_err(|e| CaptureError::Extract(e.to_string()))?;
    let doc = frontmatter::render(&article, &fetched.final_url, Utc::now());

    let target = vault_root.join(&doc.filename);
    if target.exists() {
        return Err(CaptureError::AlreadyExists(target.display().to_string()));
    }
    std::fs::write(&target, doc.contents).map_err(|e| CaptureError::Write(e.to_string()))?;
    Ok(target)
}

#[tauri::command]
pub async fn capture_url(
    state: tauri::State<'_, crate::vault::VaultState>,
    url: String,
) -> Result<String, String> {
    let vault_root = state.current_root().ok_or("no vault open")?;
    capture_url_inner(&vault_root, &url).await
        .map(|p| p.display().to_string())
        .map_err(|e| e.to_string())
}
```

(The exact `VaultState` API is in `src-tauri/src/vault/`; verify the method to read the active vault root before writing this. If it's `state.root()` instead of `state.current_root()`, adjust.)

**Step 4: Register the command**

In `src-tauri/src/lib.rs`, locate the `tauri::generate_handler!` macro invocation and add `commands::capture::capture_url` to the list. Also add `pub mod capture;` to `src-tauri/src/commands/mod.rs`.

**Step 5: Run, see pass**

```bash
cargo test --lib commands::capture
cargo check
```
Expected: 2 tests pass; clean compile.

**Step 6: CodeScene check** on the new file.

**Step 7: Commit**

```bash
git add src-tauri/src/commands/capture.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(capture): expose capture_url Tauri command"
```

---

## Task 8: Frontend — `useCaptureFromUrl` hook (TDD)

**Files:**
- Create: `src/hooks/useCaptureFromUrl.ts`
- Create: `src/hooks/useCaptureFromUrl.test.ts`

**Step 1: Write the failing test**

Mock the Tauri `invoke` via the existing `mock-tauri` patterns used elsewhere (see `src/mock-tauri/`).

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCaptureFromUrl } from './useCaptureFromUrl';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

beforeEach(() => { invoke.mockReset(); });

describe('useCaptureFromUrl', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useCaptureFromUrl());
    expect(result.current.status).toBe('idle');
  });

  it('reports pending while invoking', async () => {
    invoke.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useCaptureFromUrl());
    act(() => { result.current.capture('https://example.com/post'); });
    await waitFor(() => expect(result.current.status).toBe('pending'));
  });

  it('reports success with the new note path', async () => {
    invoke.mockResolvedValue('/vault/post.md');
    const { result } = renderHook(() => useCaptureFromUrl());
    await act(async () => { await result.current.capture('https://example.com/post'); });
    expect(result.current.status).toBe('success');
    expect(result.current.notePath).toBe('/vault/post.md');
    expect(invoke).toHaveBeenCalledWith('capture_url', { url: 'https://example.com/post' });
  });

  it('reports error when invoke rejects', async () => {
    invoke.mockRejectedValue('fetch failed: 500');
    const { result } = renderHook(() => useCaptureFromUrl());
    await act(async () => { await result.current.capture('https://example.com/x'); });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('fetch failed: 500');
  });
});
```

**Step 2: Run, see fail**

```bash
pnpm test src/hooks/useCaptureFromUrl
```
Expected: 4 tests fail.

**Step 3: Implement the hook**

```typescript
import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Status = 'idle' | 'pending' | 'success' | 'error';

export function useCaptureFromUrl() {
  const [status, setStatus] = useState<Status>('idle');
  const [notePath, setNotePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async (url: string) => {
    setStatus('pending');
    setNotePath(null);
    setError(null);
    try {
      const path = await invoke<string>('capture_url', { url });
      setNotePath(path);
      setStatus('success');
      return path;
    } catch (e) {
      setError(typeof e === 'string' ? e : String(e));
      setStatus('error');
      throw e;
    }
  }, []);

  return { status, notePath, error, capture };
}
```

**Step 4: Run, see pass**

```bash
pnpm test src/hooks/useCaptureFromUrl
```
Expected: 4 passed.

**Step 5: Lint + typecheck**

```bash
pnpm lint && pnpm exec tsc --noEmit
```

**Step 6: CodeScene check + commit**

```bash
git add src/hooks/useCaptureFromUrl.ts src/hooks/useCaptureFromUrl.test.ts
git commit -m "feat(capture): add useCaptureFromUrl hook"
```

---

## Task 9: Frontend — `CaptureFromUrlDialog` component (TDD)

**Files:**
- Create: `src/components/CaptureFromUrlDialog.tsx`
- Create: `src/components/CaptureFromUrlDialog.test.tsx`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaptureFromUrlDialog } from './CaptureFromUrlDialog';

vi.mock('../hooks/useCaptureFromUrl', () => ({
  useCaptureFromUrl: () => ({ status: 'idle', notePath: null, error: null, capture: vi.fn() }),
}));

describe('CaptureFromUrlDialog', () => {
  it('renders an input and a disabled Capture button when empty', () => {
    render(<CaptureFromUrlDialog open onOpenChange={() => {}} />);
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /capture/i })).toBeDisabled();
  });

  it('enables the button once a URL is typed', async () => {
    render(<CaptureFromUrlDialog open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByLabelText(/url/i), 'https://example.com/post');
    expect(screen.getByRole('button', { name: /capture/i })).toBeEnabled();
  });
});
```

**Step 2: Run, see fail**

**Step 3: Implement using shadcn `Dialog`, `Input`, `Button`** (per AGENTS.md: "Always use shadcn/ui components. Never use raw HTML form elements.")

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useCaptureFromUrl } from '../hooks/useCaptureFromUrl';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured?: (notePath: string) => void;
}

export function CaptureFromUrlDialog({ open, onOpenChange, onCaptured }: Props) {
  const [url, setUrl] = useState('');
  const { status, error, capture } = useCaptureFromUrl();
  const trimmed = url.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    try {
      const path = await capture(trimmed);
      onCaptured?.(path);
      onOpenChange(false);
      setUrl('');
    } catch {
      // error surfaced via status
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Capture from URL</DialogTitle>
          </DialogHeader>
          <label htmlFor="capture-url" className="sr-only">URL</label>
          <Input id="capture-url" placeholder="https://..." value={url}
            onChange={(e) => setUrl(e.target.value)} autoFocus />
          {status === 'error' && error && (
            <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!trimmed || status === 'pending'}>
              {status === 'pending' ? 'Capturing…' : 'Capture'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 4: Run, see pass**

**Step 5: Commit**

```bash
git add src/components/CaptureFromUrlDialog.tsx src/components/CaptureFromUrlDialog.test.tsx
git commit -m "feat(capture): add CaptureFromUrlDialog component"
```

---

## Task 10: Wire dialog into menu + global hotkey

**Files:**
- Modify: `src/App.tsx` (or whichever component owns top-level dialogs — verify via grep for existing `Dialog` usage at the App root)
- Modify: `src-tauri/src/menu.rs` (add menu item with accelerator `CmdOrCtrl+Shift+U`; `CmdOrCtrl+Shift+L` remains reserved for the AI panel)

**Step 1: Add the menu item**

In `menu.rs`, add a new item under the appropriate submenu (likely "File" or "Capture"). Use the project's accelerator helper. Emit a Tauri event when selected.

**Step 2: Listen for the event in the frontend**

In the App component or a new `useCaptureMenuItem` hook, subscribe to the event and toggle dialog `open` state.

**Step 3: Manual verification**

```bash
pnpm tauri dev &
sleep 10
bash ~/.openclaw/skills/tolaria-qa/scripts/focus-app.sh laputa
osascript -e 'tell application "System Events" to keystroke "l" using {command down, shift down}'
bash ~/.openclaw/skills/tolaria-qa/scripts/screenshot.sh /tmp/qa-capture-dialog.png
```

Verify the dialog opens.

**Step 4: Commit**

```bash
git add src/App.tsx src-tauri/src/menu.rs
git commit -m "feat(capture): wire CaptureFromUrlDialog to menu and hotkey"
```

---

## Task 11: Playwright smoke test

**Per AGENTS.md:** *"Tag a test with `@smoke` only if it protects a core pre-push workflow."* Capture-from-URL is a vault note-create flow, which qualifies.

**Files:**
- Create: `tests/smoke/capture-from-url.spec.ts`
- Modify: `package.json` (add the new spec to the `playwright:smoke` list)

**Step 1: Stand up a local fixture HTTP server inside the test**

Use Playwright's `route()` to intercept the test URL and return a fixture HTML body. No external network calls.

```typescript
import { test, expect } from '@playwright/test';

test('@smoke captures a generic web URL into the vault', async ({ page }) => {
  await page.route('https://fixture.local/post', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<html><head><title>Test Article</title></head>
        <body><article><h1>Test Article</h1><p>Body text.</p></article></body></html>`,
    }));

  await page.goto(process.env.BASE_URL ?? 'http://localhost:5201');
  // Trigger the dialog via the hotkey; adjust selector to match the actual menu wiring.
  await page.keyboard.press('Meta+Shift+U');
  await page.getByLabel(/url/i).fill('https://fixture.local/post');
  await page.getByRole('button', { name: /capture/i }).click();

  // After capture, the new note should appear in the file list.
  await expect(page.getByText('Test Article')).toBeVisible({ timeout: 10000 });
});
```

(Note: `page.route` only intercepts requests made by the Playwright-controlled page, not by the Rust backend. For phase 0, run a local HTTP fixture server in the spec's `beforeAll` instead — start an `http.createServer` returning the fixture HTML on a random port, and pass that URL to the dialog.)

**Step 2: Run**

```bash
pnpm dev --port 5201 &
sleep 3
BASE_URL="http://localhost:5201" npx playwright test tests/smoke/capture-from-url.spec.ts
```
Expected: pass.

**Step 3: Add to smoke list in `package.json`** so pre-push runs it.

**Step 4: Commit**

```bash
git add tests/smoke/capture-from-url.spec.ts package.json
git commit -m "test(capture): smoke test for capture-from-url flow"
```

---

## Task 12: Update docs

**Files:**
- Modify: `docs/ABSTRACTIONS.md` (add the `Capture` type and the `capture_url` command)
- Modify: `docs/ARCHITECTURE.md` (add the capture pipeline as a new subsystem)

Keep edits scoped — one paragraph in each, linking to the design doc for full context.

```bash
git add docs/ABSTRACTIONS.md docs/ARCHITECTURE.md
git commit -m "docs: record Capture type and capture_url command"
```

---

## Task 13: Pre-push verification

**Step 1: Run the full check suite locally before pushing**

```bash
pnpm lint && pnpm exec tsc --noEmit
pnpm test && pnpm test:coverage
cd src-tauri && cargo test
cd src-tauri && cargo llvm-cov --no-clean --fail-under-lines 85
cd .. && pnpm playwright:smoke
```

All must pass. Frontend coverage ≥70%, Rust coverage ≥85%.

**Step 2: CodeScene final check**

Run `mcp__codescene__code_health_score` on every file touched in this plan. Confirm Hotspot and Average aggregate scores meet `.codescene-thresholds`.

**Step 3: Push**

```bash
git push origin main
```

If pre-push hook updates `.codescene-thresholds` (because remote scores improved), commit that staged file with normal verified hooks and push again — never use `--no-verify`.

---

## Open issues this plan does not resolve

These came out of the design doc's "Open questions" list and remain open after phase 0:

1. PDF/PPT binary storage location (deferred to phase 1).
2. Transcript timestamp format (deferred to phase 1, when YouTube ingestion ships).
3. Chat-panel conversation history persistence (deferred to phase 1).
4. Sidecar thoughts behavior on Capture vs Note (verify in phase 0 manual QA; should "just work" since type is irrelevant to the thoughts mechanism, but confirm).

## Done definition for phase 0

- A user opens Tolaria pointed at `demo-vault-v2`, presses ⌘⇧L, pastes a real Substack or Medium URL, and within 15 seconds sees a new `Capture` note open in the editor with the full article body and correct frontmatter.
- The note appears in the Inbox view (no relations).
- All hooks pass on push to `main`.
- Design doc and this plan remain on disk; no rework needed.
