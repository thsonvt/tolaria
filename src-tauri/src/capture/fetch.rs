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

#[derive(Debug)]
pub struct FetchedHtml {
    pub html: String,
    pub final_url: String,
}

pub async fn fetch(url: &str) -> Result<FetchedHtml, FetchError> {
    let client = build_client()?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| FetchError::Network(e.to_string()))?;

    check_status(&response)?;
    check_content_type(&response)?;
    check_declared_length(&response)?;

    let final_url = response.url().to_string();
    let bytes = response
        .bytes()
        .await
        .map_err(|e| FetchError::Network(e.to_string()))?;
    if bytes.len() > MAX_BYTES {
        return Err(FetchError::TooLarge);
    }

    let html = String::from_utf8_lossy(&bytes).into_owned();
    Ok(FetchedHtml { html, final_url })
}

fn build_client() -> Result<reqwest::Client, FetchError> {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent("Tolaria/0.1 (+https://github.com/tolaria-app/tolaria)")
        .build()
        .map_err(|e| FetchError::Network(e.to_string()))
}

fn check_status(response: &reqwest::Response) -> Result<(), FetchError> {
    if response.status().is_success() {
        Ok(())
    } else {
        Err(FetchError::BadStatus(response.status().as_u16()))
    }
}

fn check_content_type(response: &reqwest::Response) -> Result<(), FetchError> {
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if content_type.contains("html") {
        Ok(())
    } else {
        Err(FetchError::NotHtml(content_type))
    }
}

fn check_declared_length(response: &reqwest::Response) -> Result<(), FetchError> {
    match response.content_length() {
        Some(len) if (len as usize) > MAX_BYTES => Err(FetchError::TooLarge),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn fetches_html_body() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/post"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "<html><body><h1>Hi</h1></body></html>".as_bytes(),
                "text/html; charset=utf-8",
            ))
            .mount(&server)
            .await;

        let result = fetch(&format!("{}/post", server.uri())).await.unwrap();
        assert!(result.html.contains("<h1>Hi</h1>"));
    }

    #[tokio::test]
    async fn rejects_non_html_content_type() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/feed.xml"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_raw("<rss></rss>".as_bytes(), "application/xml"),
            )
            .mount(&server)
            .await;

        let err = fetch(&format!("{}/feed.xml", server.uri()))
            .await
            .unwrap_err();
        assert!(matches!(err, FetchError::NotHtml(_)));
    }

    #[tokio::test]
    async fn rejects_4xx_5xx() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/missing"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let err = fetch(&format!("{}/missing", server.uri()))
            .await
            .unwrap_err();
        assert!(matches!(err, FetchError::BadStatus(404)));
    }

    #[tokio::test]
    async fn rejects_oversize_responses() {
        let server = MockServer::start().await;
        let big = "<html>".to_string() + &"a".repeat(MAX_BYTES + 1) + "</html>";
        Mock::given(method("GET"))
            .and(path("/big"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(big.into_bytes(), "text/html"))
            .mount(&server)
            .await;

        let err = fetch(&format!("{}/big", server.uri())).await.unwrap_err();
        assert!(matches!(err, FetchError::TooLarge));
    }
}
