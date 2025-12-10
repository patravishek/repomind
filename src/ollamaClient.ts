import {
  AskParams,
  OllamaGenerateRequest,
  OllamaGenerateResponse,
} from './types';

const OLLAMA_BASE_URL = 'http://localhost:11434';

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
