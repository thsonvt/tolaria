pub mod chunker;
pub mod embedder;
pub mod index;
pub mod model;
pub mod query;
pub mod status;

pub use chunker::{chunk_note, SemanticNoteInput};
pub use embedder::{FastEmbedder, SemanticEmbedder};
pub use index::{ChunkRecord, SemanticIndex};
pub use model::{SemanticModelManifest, SemanticModelStatus, DEFAULT_MODEL_ID};
pub use query::query_index;
pub use status::{SemanticIndexState, SemanticStatus, SemanticStatusStore};
