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
