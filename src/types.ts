export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

export interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
}

export interface AskParams {
  model: string;
  prompt: string;
}

export interface IndexEntry {
  path: string;
  size: number;
  ext: string;
}

export interface RepoIndex {
  root: string;
  generatedAt: string;
  entries: IndexEntry[];
}

export interface EmbeddingChunk {
  id: number;
  file: string; // path relative to repo root
  start: number; // character offset
  end: number; // character offset (exclusive)
  embedding: number[];
}
