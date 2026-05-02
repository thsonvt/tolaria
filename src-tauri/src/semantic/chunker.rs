use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct SemanticNoteInput {
    pub path: String,
    pub title: String,
    pub note_type: Option<String>,
    pub aliases: Vec<String>,
    pub properties: HashMap<String, String>,
    pub relationships: HashMap<String, Vec<String>>,
    pub outgoing_links: Vec<String>,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SemanticChunk {
    pub note_path: String,
    pub chunk_index: usize,
    pub text: String,
}

pub fn chunk_note(note: &SemanticNoteInput, max_words: usize) -> Vec<SemanticChunk> {
    let sections = split_h2_sections(&note.content);
    let header = metadata_header(note);
    let mut chunks = Vec::new();

    for section in sections {
        let prefixed = if chunks.is_empty() {
            format!("{header}\n\n{}", section.trim())
        } else {
            section.trim().to_string()
        };
        for piece in split_by_word_count(&prefixed, max_words) {
            if !piece.trim().is_empty() {
                chunks.push(SemanticChunk {
                    note_path: note.path.clone(),
                    chunk_index: chunks.len(),
                    text: piece,
                });
            }
        }
    }

    chunks
}

fn metadata_header(note: &SemanticNoteInput) -> String {
    let mut parts = vec![format!("Title: {}", note.title)];
    if let Some(note_type) = note
        .note_type
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        parts.push(format!("Type: {note_type}"));
    }
    if !note.aliases.is_empty() {
        parts.push(format!("Aliases: {}", note.aliases.join(", ")));
    }

    let mut properties = note.properties.iter().collect::<Vec<_>>();
    properties.sort_by(|a, b| a.0.cmp(b.0));
    for (key, value) in properties {
        if !key.starts_with('_') && !value.trim().is_empty() {
            parts.push(format!("{key}: {value}"));
        }
    }

    parts.join(" | ")
}

fn split_h2_sections(content: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut current = String::new();

    for line in content.lines() {
        if line.starts_with("## ") && !current.trim().is_empty() {
            sections.push(current);
            current = String::new();
        }
        current.push_str(line);
        current.push('\n');
    }

    if !current.trim().is_empty() {
        sections.push(current);
    }

    sections
}

fn split_by_word_count(text: &str, max_words: usize) -> Vec<String> {
    let max_words = max_words.max(1);
    let words = text.split_whitespace().collect::<Vec<_>>();
    if words.len() <= max_words {
        return vec![text.trim().to_string()];
    }

    words
        .chunks(max_words)
        .map(|chunk| chunk.join(" "))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(content: &str) -> SemanticNoteInput {
        SemanticNoteInput {
            path: "/vault/project.md".into(),
            title: "Apollo".into(),
            note_type: Some("Project".into()),
            aliases: vec!["Moonshot".into()],
            properties: HashMap::from([
                ("author".into(), "Shau".into()),
                ("status".into(), "active".into()),
            ]),
            relationships: HashMap::from([("related_to".into(), vec!["[[orbital]]".into()])]),
            outgoing_links: vec!["[[launch]]".into()],
            content: content.into(),
        }
    }

    #[test]
    fn first_chunk_includes_metadata_header() {
        let chunks = chunk_note(&note("# Apollo\n\nBody text"), 512);

        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].text.starts_with(
            "Title: Apollo | Type: Project | Aliases: Moonshot | author: Shau | status: active"
        ));
        assert!(chunks[0].text.contains("Body text"));
    }

    #[test]
    fn splits_on_h2_boundaries() {
        let chunks = chunk_note(
            &note("# Apollo\n\nIntro\n\n## Phase One\n\nBuild\n\n## Phase Two\n\nLaunch"),
            512,
        );

        assert_eq!(chunks.len(), 3);
        assert!(chunks[1].text.contains("Phase One"));
        assert!(chunks[2].text.contains("Phase Two"));
    }

    #[test]
    fn caps_chunks_by_word_count() {
        let long = (0..620)
            .map(|i| format!("word{i}"))
            .collect::<Vec<_>>()
            .join(" ");
        let chunks = chunk_note(&note(&long), 128);

        assert!(chunks.len() > 1);
        assert!(chunks
            .iter()
            .all(|chunk| chunk.text.split_whitespace().count() <= 180));
    }
}
