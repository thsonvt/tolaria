pub trait SemanticEmbedder {
    fn embed_passages(&mut self, passages: Vec<String>) -> Result<Vec<Vec<f32>>, String>;
    fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String>;
}

pub struct FastEmbedder {
    model: fastembed::TextEmbedding,
}

impl FastEmbedder {
    pub fn new() -> Result<Self, String> {
        let model = fastembed::TextEmbedding::try_new(
            fastembed::InitOptions::new(fastembed::EmbeddingModel::AllMiniLML6V2)
                .with_show_download_progress(false),
        )
        .map_err(|e| format!("Failed to initialize semantic embedding model: {e}"))?;

        Ok(Self { model })
    }
}

impl SemanticEmbedder for FastEmbedder {
    fn embed_passages(&mut self, passages: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
        let prefixed = passages
            .into_iter()
            .map(|text| format!("passage: {text}"))
            .collect::<Vec<_>>();
        self.model
            .embed(prefixed, None)
            .map_err(|e| format!("Failed to embed passages: {e}"))
    }

    fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String> {
        self.model
            .embed(vec![format!("query: {query}")], None)
            .map_err(|e| format!("Failed to embed query: {e}"))?
            .into_iter()
            .next()
            .ok_or_else(|| "Embedding model returned no query vector".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeEmbedder;

    impl SemanticEmbedder for FakeEmbedder {
        fn embed_passages(&mut self, passages: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
            Ok(passages
                .into_iter()
                .map(|text| vec![text.len() as f32, 1.0])
                .collect())
        }

        fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String> {
            Ok(vec![query.len() as f32, 1.0])
        }
    }

    #[test]
    fn fake_embedder_returns_one_vector_per_passage() {
        let mut embedder = FakeEmbedder;

        let vectors = embedder
            .embed_passages(vec!["short".into(), "longer".into()])
            .unwrap();

        assert_eq!(vectors, vec![vec![5.0, 1.0], vec![6.0, 1.0]]);
    }
}
