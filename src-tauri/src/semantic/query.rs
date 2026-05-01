use super::index::{ChunkRecord, SemanticIndex};
use crate::search::{SearchResponse, SearchResult};
use std::collections::HashMap;

pub fn query_index(
    index: &SemanticIndex,
    query_embedding: &[f32],
    query: &str,
    limit: usize,
    elapsed_ms: u64,
) -> SearchResponse {
    let mut best_by_note: HashMap<&str, (&ChunkRecord, f64)> = HashMap::new();

    for chunk in &index.chunks {
        let score = cosine_similarity(query_embedding, &chunk.embedding);
        best_by_note
            .entry(&chunk.note_path)
            .and_modify(|current| {
                if score > current.1 {
                    *current = (chunk, score);
                }
            })
            .or_insert((chunk, score));
    }

    let mut results = best_by_note
        .into_values()
        .map(|(chunk, score)| SearchResult {
            title: chunk.title.clone(),
            path: chunk.note_path.clone(),
            snippet: chunk.text.chars().take(220).collect(),
            score,
            note_type: chunk.note_type.clone(),
        })
        .collect::<Vec<_>>();

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit);

    SearchResponse {
        results,
        elapsed_ms,
        query: query.to_string(),
        mode: "semantic".to_string(),
    }
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.is_empty() || a.len() != b.len() {
        return 0.0;
    }

    let mut dot = 0.0_f64;
    let mut norm_a = 0.0_f64;
    let mut norm_b = 0.0_f64;

    for (left, right) in a.iter().zip(b.iter()) {
        let left = *left as f64;
        let right = *right as f64;
        dot += left * right;
        norm_a += left * left;
        norm_b += right * right;
    }

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a.sqrt() * norm_b.sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn chunk(note_path: &str, title: &str, embedding: Vec<f32>, text: &str) -> ChunkRecord {
        ChunkRecord {
            chunk_id: format!("{note_path}#0"),
            note_path: note_path.into(),
            title: title.into(),
            note_type: Some("Project".into()),
            aliases: vec![],
            properties: HashMap::new(),
            relationships: HashMap::new(),
            outgoing_links: vec![],
            text: text.into(),
            text_hash: "hash".into(),
            embedding,
        }
    }

    #[test]
    fn cosine_similarity_orders_matching_note_first() {
        let mut index = SemanticIndex::new("model", "v1");
        index.chunks = vec![
            chunk("/vault/a.md", "Apollo", vec![1.0, 0.0], "moon mission"),
            chunk("/vault/b.md", "Baking", vec![0.0, 1.0], "bread recipe"),
        ];

        let response = query_index(&index, &[1.0, 0.0], "space project", 10, 0);

        assert_eq!(response.results[0].path, "/vault/a.md");
        assert_eq!(response.results[0].title, "Apollo");
    }

    #[test]
    fn multiple_chunks_are_aggregated_per_note() {
        let mut index = SemanticIndex::new("model", "v1");
        index.chunks = vec![
            chunk("/vault/a.md", "Apollo", vec![0.1, 0.9], "weak chunk"),
            chunk("/vault/a.md", "Apollo", vec![1.0, 0.0], "strong chunk"),
            chunk("/vault/b.md", "Baking", vec![0.8, 0.2], "other chunk"),
        ];

        let response = query_index(&index, &[1.0, 0.0], "apollo", 10, 12);

        assert_eq!(response.elapsed_ms, 12);
        assert_eq!(response.results.len(), 2);
        assert_eq!(response.results[0].snippet, "strong chunk");
    }
}
