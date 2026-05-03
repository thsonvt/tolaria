//! Compose Markdown frontmatter and body for captured web articles.

use chrono::{DateTime, Utc};

use crate::capture::extract::ExtractedArticle;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureDocument {
    pub filename: String,
    pub contents: String,
}

pub fn render(
    article: &ExtractedArticle,
    source_url: &str,
    captured_at: DateTime<Utc>,
) -> CaptureDocument {
    CaptureDocument {
        filename: filename_for(&article.title, captured_at),
        contents: contents_for(article, source_url, captured_at),
    }
}

fn filename_for(title: &str, captured_at: DateTime<Utc>) -> String {
    let slug = slugify(title);
    if slug.is_empty() {
        format!("capture-{}.md", captured_at.format("%Y-%m-%d-%H%M%S"))
    } else {
        format!("{}.md", slug)
    }
}

fn slugify(input: &str) -> String {
    input
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn contents_for(
    article: &ExtractedArticle,
    source_url: &str,
    captured_at: DateTime<Utc>,
) -> String {
    let title = display_title(article, captured_at);
    let mut out = String::from("---\n");
    out.push_str("type: Capture\n");
    out.push_str("source: web\n");
    out.push_str(&format!("url: {}\n", source_url));
    out.push_str(&format!("title: {}\n", title));
    if let Some(author) = clean_author(article) {
        out.push_str(&format!("author: {}\n", author));
    }
    out.push_str(&format!(
        "captured_at: {}\n",
        captured_at.format("%Y-%m-%dT%H:%M:%SZ")
    ));
    out.push_str("---\n\n");
    out.push_str(&format!("# {}\n\n", title));
    out.push_str(article.body_markdown.trim());
    out.push('\n');
    out
}

fn display_title(article: &ExtractedArticle, captured_at: DateTime<Utc>) -> String {
    let title = article.title.trim();
    if title.is_empty() {
        format!("Capture {}", captured_at.format("%Y-%m-%d %H:%M:%S"))
    } else {
        title.to_string()
    }
}

fn clean_author(article: &ExtractedArticle) -> Option<&str> {
    article
        .byline
        .as_deref()
        .map(str::trim)
        .filter(|author| !author.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn sample() -> ExtractedArticle {
        ExtractedArticle {
            title: "How to Think About Knowledge".into(),
            byline: Some("Jane Doe".into()),
            body_markdown: "# Section One\n\nAn evergreen note is...".into(),
        }
    }

    fn fixed_time() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 5, 3, 22, 14, 0).unwrap()
    }

    #[test]
    fn renders_filename_from_title_slug() {
        let doc = render(&sample(), "https://example.com/post", fixed_time());
        assert_eq!(doc.filename, "how-to-think-about-knowledge.md");
    }

    #[test]
    fn renders_frontmatter_with_all_fields() {
        let doc = render(&sample(), "https://example.com/post", fixed_time());
        assert!(doc.contents.starts_with("---\n"));
        assert!(doc.contents.contains("type: Capture\n"));
        assert!(doc.contents.contains("source: web\n"));
        assert!(doc.contents.contains("url: https://example.com/post\n"));
        assert!(doc
            .contents
            .contains("title: How to Think About Knowledge\n"));
        assert!(doc.contents.contains("author: Jane Doe\n"));
        assert!(doc.contents.contains("captured_at: 2026-05-03T22:14:00Z\n"));
    }

    #[test]
    fn renders_body_after_frontmatter() {
        let doc = render(&sample(), "https://example.com/post", fixed_time());
        assert!(doc.contents.contains("# How to Think About Knowledge"));
        assert!(doc.contents.contains("# Section One"));
    }

    #[test]
    fn omits_author_field_when_byline_missing() {
        let mut article = sample();
        article.byline = None;
        let doc = render(&article, "https://example.com/post", fixed_time());
        assert!(!doc.contents.contains("author:"));
    }

    #[test]
    fn falls_back_to_captured_at_for_filename_when_title_is_empty() {
        let mut article = sample();
        article.title.clear();
        let doc = render(&article, "https://example.com/post", fixed_time());
        assert_eq!(doc.filename, "capture-2026-05-03-221400.md");
        assert!(doc.contents.contains("# Capture 2026-05-03 22:14:00"));
    }
}
