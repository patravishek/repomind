import fs from 'fs';
import path from 'path';
import { EmbeddingChunk, RepoIndex } from './types';
import { embedText } from './ollamaClient';

const DEFAULT_CHUNK_SIZE = 800; // characters
const DEFAULT_MAX_CHUNKS_PER_FILE = 8;

export interface EmbeddingIndexOptions {
  rootDir: string;
  index: RepoIndex;
  outputPath?: string; // defaults to .repomind-vec.json in repo root
  chunkSize?: number;
  maxChunksPerFile?: number;
}

function chunkText(text: string, chunkSize: number, maxChunks: number): { start: number; end: number; text: string }[] {
  const chunks: { start: number; end: number; text: string }[] = [];
  let start = 0;
  let count = 0;

  while (start < text.length && count < maxChunks) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push({ start, end, text: text.slice(start, end) });
    start = end;
    count += 1;
  }

  return chunks;
}

export async function buildEmbeddingIndex(options: EmbeddingIndexOptions): Promise<EmbeddingChunk[]> {
  const rootDir = path.resolve(options.rootDir);
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxChunksPerFile = options.maxChunksPerFile ?? DEFAULT_MAX_CHUNKS_PER_FILE;

  const chunks: EmbeddingChunk[] = [];
  let nextId = 0;

  for (const entry of options.index.entries) {
    const absPath = path.join(rootDir, entry.path);

    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch {
      continue;
    }

    const fileChunks = chunkText(content, chunkSize, maxChunksPerFile);

    for (const ch of fileChunks) {
      const embedding = await embedText(ch.text);

      chunks.push({
        id: nextId++,
        file: entry.path,
        start: ch.start,
        end: ch.end,
        embedding,
      });
    }
  }

  const outputPath = options.outputPath ?? path.join(rootDir, '.repomind-vec.json');

  try {
    fs.writeFileSync(outputPath, JSON.stringify(chunks), 'utf8');
  } catch (err) {
    throw new Error(`Failed to write embedding index at ${outputPath}: ${(err as Error).message}`);
  }

  return chunks;
}
