//! Article extraction: HTML → cleaned title, byline, and Markdown body.

use readability::extractor;
use regex::Regex;
use url::Url;

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
    let url = Url::parse(base_url).map_err(|e| ExtractError::Readability(e.to_string()))?;
    let product = run_readability(html, &url)?;
    let body_markdown = to_markdown(&product.content)?;
    let trimmed = body_markdown.trim().to_string();
    if trimmed.is_empty() {
        return Err(ExtractError::Empty);
    }
    Ok(ExtractedArticle {
        title: product.title,
        byline: extract_byline(html),
        body_markdown: trimmed,
    })
}

fn run_readability(html: &str, url: &Url) -> Result<extractor::Product, ExtractError> {
    let mut bytes = html.as_bytes();
    extractor::extract(&mut bytes, url).map_err(|e| ExtractError::Readability(e.to_string()))
}

fn to_markdown(html: &str) -> Result<String, ExtractError> {
    htmd::convert(html).map_err(|e| ExtractError::Readability(e.to_string()))
}

fn extract_byline(html: &str) -> Option<String> {
    let re = Regex::new(r#"(?i)<meta\s+name=["']author["']\s+content=["']([^"']+)["']"#).ok()?;
    re.captures(html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture(name: &str) -> String {
        let path = format!("tests/fixtures/{}", name);
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {}", path, e))
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
