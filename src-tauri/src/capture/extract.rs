//! Article extraction: HTML → cleaned title, byline, and Markdown body.

use readability::extractor;
use regex::Regex;
use url::Url;

#[derive(Debug, Clone)]
pub struct ExtractedArticle {
    pub title: String,
    pub byline: Option<String>,
    pub description: Option<String>,
    pub hero_image: Option<String>,
    pub body_markdown: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ExtractError {
    #[error("invalid base url: {0}")]
    InvalidUrl(String),
    #[error("readability failed: {0}")]
    Readability(String),
    #[error("article body is empty")]
    Empty,
}

pub fn extract(html: &str, base_url: &str) -> Result<ExtractedArticle, ExtractError> {
    let url = Url::parse(base_url).map_err(|e| ExtractError::InvalidUrl(e.to_string()))?;
    let normalized_html = normalize_before_readability(html);
    let product = run_readability(&normalized_html, &url)?;
    let body_markdown = to_markdown(&product.content)?;
    let body_markdown = restore_preserved_link_sections(&body_markdown, html, &url);
    let trimmed = body_markdown.trim().to_string();
    if trimmed.is_empty() {
        return Err(ExtractError::Empty);
    }
    Ok(ExtractedArticle {
        title: product.title,
        byline: extract_byline(html),
        description: extract_description(html),
        hero_image: extract_hero_image(html, &url),
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

fn normalize_before_readability(html: &str) -> String {
    let with_images = inject_substack_captioned_images(html);
    demote_substack_anchor_headings(&with_images)
}

fn inject_substack_captioned_images(html: &str) -> String {
    const MARKER: &str = "captioned-image-container";
    let mut insertions: Vec<(usize, String)> = Vec::new();
    let mut search_from = 0;

    while let Some(relative_marker_index) = html[search_from..].find(MARKER) {
        let marker_index = search_from + relative_marker_index;
        let Some(div_start) = html[..marker_index].rfind("<div") else {
            search_from = marker_index + MARKER.len();
            continue;
        };
        if marker_index.saturating_sub(div_start) > 256 {
            search_from = marker_index + MARKER.len();
            continue;
        }

        let scan_end = html.len().min(marker_index + 8_000);
        if let Some(image_html) = substack_captioned_image_fallback(&html[marker_index..scan_end]) {
            insertions.push((div_start, image_html));
        }
        search_from = marker_index + MARKER.len();
    }

    if insertions.is_empty() {
        return html.to_string();
    }

    let mut out =
        String::with_capacity(html.len() + insertions.iter().map(|(_, s)| s.len()).sum::<usize>());
    let mut cursor = 0;
    for (index, insertion) in insertions {
        out.push_str(&html[cursor..index]);
        out.push_str(&insertion);
        cursor = index;
    }
    out.push_str(&html[cursor..]);
    out
}

fn substack_captioned_image_fallback(fragment: &str) -> Option<String> {
    let image_start = fragment.find("<img")?;
    let image_fragment = &fragment[image_start..];
    let image_end = image_fragment.find('>')?;
    let image_tag = &image_fragment[..=image_end];
    let src = html_attr(image_tag, "src")?;
    let alt = html_attr(image_tag, "alt").unwrap_or_default();
    Some(format!(
        r#"<p data-tolaria-capture-image="substack"><img src="{}" alt="{}"></p>"#,
        escape_html_attr(&src),
        escape_html_attr(&alt)
    ))
}

fn demote_substack_anchor_headings(html: &str) -> String {
    let Ok(re) = Regex::new(
        r#"(?is)<h1(?P<attrs>[^>]*class=["'][^"']*\bheader-anchor-post\b[^"']*["'][^>]*)>(?P<body>.*?)</h1>"#,
    ) else {
        return html.to_string();
    };

    re.replace_all(html, |caps: &regex::Captures<'_>| {
        let text = plain_text(&caps["body"]);
        if text.is_empty() {
            caps[0].to_string()
        } else {
            format!("<h2>{}</h2>", escape_html_text(&text))
        }
    })
    .into_owned()
}

fn html_attr(tag: &str, name: &str) -> Option<String> {
    let pattern = format!(
        r#"(?is)\b{}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#,
        regex::escape(name)
    );
    let re = Regex::new(&pattern).ok()?;
    let captures = re.captures(tag)?;
    captures
        .get(1)
        .or_else(|| captures.get(2))
        .or_else(|| captures.get(3))
        .map(|m| decode_basic_entities(m.as_str().trim()))
        .filter(|value| !value.is_empty())
}

fn plain_text(html: &str) -> String {
    let Ok(tag_re) = Regex::new(r"(?is)<[^>]+>") else {
        return String::new();
    };
    let without_tags = tag_re.replace_all(html, " ");
    decode_basic_entities(&without_tags)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn decode_basic_entities(input: &str) -> String {
    input
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

fn escape_html_attr(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_html_text(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[derive(Debug, Clone)]
struct PreservedLinkSection {
    level: usize,
    heading: String,
    items: Vec<PreservedLinkItem>,
}

#[derive(Debug, Clone)]
struct PreservedLinkItem {
    title: String,
    url: String,
    suffix: String,
}

fn restore_preserved_link_sections(markdown: &str, html: &str, base_url: &Url) -> String {
    let sections = preserved_link_sections(html, base_url);
    if sections.is_empty() {
        return markdown.to_string();
    }

    let mut restored = markdown.to_string();
    for section in sections {
        if section
            .items
            .iter()
            .any(|item| restored.contains(&item.url))
        {
            continue;
        }
        restored = insert_link_section_items(restored, &section);
    }
    restored
}

fn insert_link_section_items(markdown: String, section: &PreservedLinkSection) -> String {
    let heading_line = format!("{} {}", "#".repeat(section.level), section.heading);
    let list_markdown = section
        .items
        .iter()
        .map(|item| {
            let suffix = item.suffix.trim();
            if suffix.is_empty() {
                format!("* [{}]({})", item.title, item.url)
            } else {
                format!("* [{}]({}) {}", item.title, item.url, suffix)
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    if let Some(heading_start) = markdown.find(&heading_line) {
        let insert_at = markdown[heading_start..]
            .find('\n')
            .map(|offset| heading_start + offset + 1)
            .unwrap_or(markdown.len());
        let mut out = String::with_capacity(markdown.len() + list_markdown.len() + 4);
        out.push_str(markdown[..insert_at].trim_end());
        out.push_str("\n\n");
        out.push_str(&list_markdown);
        out.push_str("\n\n");
        out.push_str(markdown[insert_at..].trim_start());
        out
    } else {
        let mut out = markdown.trim_end().to_string();
        out.push_str("\n\n");
        out.push_str(&heading_line);
        out.push_str("\n\n");
        out.push_str(&list_markdown);
        out
    }
}

fn preserved_link_sections(html: &str, base_url: &Url) -> Vec<PreservedLinkSection> {
    let Ok(heading_re) = Regex::new(r"(?is)<h([1-6])\b[^>]*>(.*?)</h[1-6]>") else {
        return Vec::new();
    };
    let mut sections = Vec::new();
    for caps in heading_re.captures_iter(html) {
        let Some(full_heading) = caps.get(0) else {
            continue;
        };
        let level = caps
            .get(1)
            .and_then(|m| m.as_str().parse::<usize>().ok())
            .unwrap_or(2)
            .max(2);
        let heading = caps
            .get(2)
            .map(|m| plain_text(m.as_str()))
            .unwrap_or_default();
        if !is_preservable_link_section_heading(&heading) {
            continue;
        }
        let after_heading = &html[full_heading.end()..];
        let section_end = next_heading_offset(after_heading).unwrap_or(after_heading.len());
        let section_html = &after_heading[..section_end];
        let items = preserved_link_items(section_html, base_url);
        if !items.is_empty() {
            sections.push(PreservedLinkSection {
                level,
                heading,
                items,
            });
        }
    }
    sections
}

fn is_preservable_link_section_heading(heading: &str) -> bool {
    let lower = heading.to_lowercase();
    lower.contains("sources")
        || lower.contains("further reading")
        || lower.contains("references")
        || lower.contains("resources")
}

fn next_heading_offset(html: &str) -> Option<usize> {
    let re = Regex::new(r"(?is)<h[1-6]\b").ok()?;
    re.find(html).map(|m| m.start())
}

fn preserved_link_items(html: &str, base_url: &Url) -> Vec<PreservedLinkItem> {
    let Ok(item_re) = Regex::new(r"(?is)<li\b[^>]*>(.*?)</li>") else {
        return Vec::new();
    };
    item_re
        .captures_iter(html)
        .filter_map(|caps| {
            caps.get(1)
                .and_then(|m| preserved_link_item(m.as_str(), base_url))
        })
        .collect()
}

fn preserved_link_item(html: &str, base_url: &Url) -> Option<PreservedLinkItem> {
    let link_re = Regex::new(r#"(?is)<a\b([^>]*)>(.*?)</a>"#).ok()?;
    let caps = link_re.captures(html)?;
    let link_match = caps.get(0)?;
    let href = html_attr(caps.get(1)?.as_str(), "href")?;
    let url = base_url.join(&href).ok()?.to_string();
    let title = caps
        .get(2)
        .map(|m| plain_text(m.as_str()))
        .unwrap_or_default();
    if title.is_empty() {
        return None;
    }
    let suffix = plain_text(&html[link_match.end()..]);
    Some(PreservedLinkItem { title, url, suffix })
}

fn extract_description(html: &str) -> Option<String> {
    first_meta_content(
        html,
        &[
            ("name", "description"),
            ("property", "og:description"),
            ("name", "twitter:description"),
            ("property", "twitter:description"),
        ],
    )
}

fn extract_hero_image(html: &str, base_url: &Url) -> Option<String> {
    first_meta_content(
        html,
        &[
            ("property", "og:image"),
            ("property", "og:image:url"),
            ("name", "twitter:image"),
            ("name", "twitter:image:src"),
            ("property", "twitter:image"),
            ("property", "twitter:image:src"),
        ],
    )
    .and_then(|image| absolute_url(base_url, &image))
}

fn first_meta_content(html: &str, selectors: &[(&str, &str)]) -> Option<String> {
    selectors
        .iter()
        .find_map(|(name, value)| meta_content(html, name, value))
}

fn meta_content(html: &str, name: &str, value: &str) -> Option<String> {
    let meta_re = Regex::new(r"(?is)<meta\b[^>]*>").ok()?;
    for tag in meta_re.find_iter(html).map(|m| m.as_str()) {
        if meta_attr_matches(tag, name, value) {
            return html_attr(tag, "content");
        }
    }
    None
}

fn meta_attr_matches(tag: &str, name: &str, expected: &str) -> bool {
    html_attr(tag, name)
        .as_deref()
        .is_some_and(|actual| actual.eq_ignore_ascii_case(expected))
}

fn absolute_url(base_url: &Url, value: &str) -> Option<String> {
    base_url.join(value.trim()).ok().map(|url| url.to_string())
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
    fn captures_article_description_and_hero_image_metadata() {
        let html = r#"
            <html>
              <head>
                <title>Progressive Disclosure for AI Agents</title>
                <meta
                  name="description"
                  content="How agents can reveal context and tools only when they matter."
                />
                <meta property="og:image" content="/images/agent-disclosure.png" />
              </head>
              <body>
                <article>
                  <h1>Progressive Disclosure for AI Agents</h1>
                  <p>Progressive disclosure helps agents avoid overwhelming users.</p>
                </article>
              </body>
            </html>
        "#;

        let article =
            extract(html, "https://www.honra.io/articles/progressive-disclosure").unwrap();

        assert_eq!(
            article.description.as_deref(),
            Some("How agents can reveal context and tools only when they matter.")
        );
        assert_eq!(
            article.hero_image.as_deref(),
            Some("https://www.honra.io/images/agent-disclosure.png")
        );
    }

    #[test]
    fn preserves_substack_picture_images_and_following_headings() {
        let html = r#"
            <html>
              <body>
                <article>
                  <h1>Claude Code Architecture</h1>
                  <p>We are entering the third era of LLM applications.</p>
                  <p>The harness is the body and context economy matters.</p>
                  <div class="captioned-image-container">
                    <figure>
                      <a href="https://cdn.example.com/full-size.png" class="image-link">
                        <div class="image2-inset">
                          <picture>
                            <source
                              type="image/webp"
                              srcset="https://cdn.example.com/image-424.webp 424w, https://cdn.example.com/image-848.webp 848w"
                            />
                            <img
                              alt="Inside Claude Code architecture diagram"
                              src="https://cdn.example.com/image.png"
                            />
                          </picture>
                        </div>
                      </a>
                    </figure>
                  </div>
                  <div class="subscription-widget-wrap">
                    <form><input name="email" type="email" /></form>
                  </div>
                  <h1 class="header-anchor-post">
                    Background
                    <div class="header-anchor-parent">
                      <button aria-label="Link"><svg><title></title></svg></button>
                    </div>
                  </h1>
                  <p>I got curious and reverse engineered the design pillars.</p>
                </article>
              </body>
            </html>
        "#;

        let article = extract(html, "https://example.substack.com/p/post").unwrap();

        assert!(article.body_markdown.contains(
            "![Inside Claude Code architecture diagram](https://cdn.example.com/image.png)"
        ));
        assert!(article.body_markdown.contains("## Background"));
    }

    #[test]
    fn preserves_sources_and_further_reading_links() {
        let html = r#"
            <html>
              <body>
                <article>
                  <h1>Why AI Agents Need Progressive Disclosure</h1>
                  <p>Progressive disclosure is ultimately about respect for the limits of attention.</p>
                  <p>The most capable AI systems know what to know, and when to know it.</p>
                  <h2>Sources &amp; Further Reading</h2>
                  <ul>
                    <li>
                      <a href="https://www.interaction-design.org/literature/topics/progressive-disclosure">
                        What is Progressive Disclosure?
                      </a>
                      - Interaction Design Foundation
                    </li>
                    <li>
                      <a href="https://www.redhat.com/en/blog/tool-rag-scalable-ai-agents">
                        Tool RAG: The Next Breakthrough in Scalable AI Agents
                      </a>
                      - Red Hat Emerging Technologies
                    </li>
                    <li>
                      <a href="https://weaviate.io/blog/context-engineering-agentic-rag">
                        Context Engineering for AI Agents
                      </a>
                      - Weaviate
                    </li>
                  </ul>
                </article>
              </body>
            </html>
        "#;

        let article = extract(html, "https://honra.io/articles/progressive-disclosure").unwrap();

        assert!(article
            .body_markdown
            .contains("## Sources & Further Reading"));
        assert!(article.body_markdown.contains(
            "[What is Progressive Disclosure?](https://www.interaction-design.org/literature/topics/progressive-disclosure)"
        ));
        assert!(article.body_markdown.contains(
            "[Tool RAG: The Next Breakthrough in Scalable AI Agents](https://www.redhat.com/en/blog/tool-rag-scalable-ai-agents)"
        ));
        assert!(article.body_markdown.contains(
            "[Context Engineering for AI Agents](https://weaviate.io/blog/context-engineering-agentic-rag)"
        ));
    }

    #[test]
    fn rejects_empty_body() {
        let err = extract("<html><body></body></html>", "https://example.com").unwrap_err();
        assert!(matches!(err, ExtractError::Empty));
    }

    #[test]
    fn rejects_invalid_base_url() {
        let err = extract("<html><body><p>x</p></body></html>", "not a url").unwrap_err();
        assert!(matches!(err, ExtractError::InvalidUrl(_)));
    }
}
