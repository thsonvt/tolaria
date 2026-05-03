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
        assert_eq!(
            validate("  https://example.com/post  ").unwrap(),
            "https://example.com/post"
        );
    }

    #[test]
    fn accepts_http() {
        assert_eq!(
            validate("http://example.com").unwrap(),
            "http://example.com/"
        );
    }
}
