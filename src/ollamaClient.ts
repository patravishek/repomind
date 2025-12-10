import {
  AskParams,
  OllamaGenerateRequest,
  OllamaGenerateResponse,
  OllamaEmbeddingRequest,
  OllamaEmbeddingResponse,
} from './types';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_EMBED_MODEL = 'nomic-embed-text';

export async function askOllama({ model, prompt }: AskParams): Promise<string> {
  const url = `${OLLAMA_BASE_URL}/api/generate`;

  const body: OllamaGenerateRequest = {
    model,
    prompt,
    stream: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Ollama error: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  const data = (await response.json()) as OllamaGenerateResponse;

  if (!data || typeof data.response !== 'string') {
    throw new Error('Unexpected Ollama response format');
  }

  return data.response;
}

export async function embedText(
  text: string,
  model: string = DEFAULT_EMBED_MODEL,
): Promise<number[]> {
  const url = `${OLLAMA_BASE_URL}/api/embeddings`;

  const body: OllamaEmbeddingRequest = {
    model,
    prompt: text,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const textBody = await response.text();
    throw new Error(
      `Ollama embeddings error: ${response.status} ${response.statusText}\n${textBody}`,
    );
  }

  const data = (await response.json()) as OllamaEmbeddingResponse;

  if (!data || !Array.isArray(data.embedding)) {
    throw new Error('Unexpected Ollama embeddings response format');
  }

  return data.embedding;
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}
