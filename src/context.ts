import fs from 'fs';
import path from 'path';
import { EmbeddingChunk, RepoIndex } from './types';
import { embedText } from './ollamaClient';

export interface BuildContextOptions {
  /** Directory where the user invoked repomind. */
  startDir?: string;
  /** Max number of files to include as context. */
  maxFiles?: number;
  /** Max characters per file snippet. */
  maxCharsPerFile?: number;
}

function findIndexFile(startDir: string): string | null {
  let current = path.resolve(startDir);

  // Walk up until filesystem root looking for .repomind-index.json
  // This lets users run repomind from subdirectories.
  // e.g. repo root has .repomind-index.json, user is in repo/src
  while (true) {
    const candidate = path.join(current, '.repomind-index.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

function loadIndex(startDir: string): RepoIndex | null {
  const indexPath = findIndexFile(startDir);
  if (!indexPath) {
    return null;
  }

  try {
    const raw = fs.readFileSync(indexPath, 'utf8');
    const index = JSON.parse(raw) as RepoIndex;
    return index;
  } catch {
    return null;
  }
}

function loadEmbeddingIndex(index: RepoIndex): EmbeddingChunk[] | null {
  const vecPath = path.join(index.root, '.repomind-vec.json');
  if (!fs.existsSync(vecPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(vecPath, 'utf8');
    const data = JSON.parse(raw) as EmbeddingChunk[];
    if (!Array.isArray(data)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function extractKeywords(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter((w) => w.length >= 3 && w.length <= 40);
}

function scorePath(filePath: string, keywords: string[]): number {
  const lower = filePath.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) {
      score += 1;
    }
  }
  return score;
}

interface SelectedFile {
  absPath: string;
  relPath: string;
}

function selectFilesByPath(
  index: RepoIndex,
  keywords: string[],
  maxFiles: number,
): SelectedFile[] {
  if (index.entries.length === 0 || keywords.length === 0) {
    return [];
  }

  const scored = index.entries
    .map((e) => ({
      entry: e,
      score: scorePath(e.path, keywords),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));

  const top = scored.slice(0, maxFiles);

  return top.map((s) => ({
    absPath: path.join(index.root, s.entry.path),
    relPath: s.entry.path,
  }));
}

function readFileSnippet(absPath: string, maxCharsPerFile: number): string | null {
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    if (content.length <= maxCharsPerFile) {
      return content;
    }
    return content.slice(0, maxCharsPerFile) + '\n... [truncated]';
  } catch {
    return null;
  }
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

async function buildPromptFromEmbeddings(
  question: string,
  index: RepoIndex,
  embeddingChunks: EmbeddingChunk[],
  maxCharsPerFile: number,
): Promise<{ prompt: string; usedFiles: string[] }> {
  if (embeddingChunks.length === 0) {
    return {
      prompt: question,
      usedFiles: [],
    };
  }

  const questionEmbedding = await embedText(question);
  const qVec = new Float32Array(questionEmbedding);

  const scored = embeddingChunks.map((chunk) => {
    const v = new Float32Array(chunk.embedding);
    return {
      chunk,
      score: cosineSim(qVec, v),
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const topChunks = scored.slice(0, 10).map((s) => s.chunk);

  const contextBlocks: string[] = [];
  const usedFilesSet = new Set<string>();

  for (const ch of topChunks) {
    const absPath = path.join(index.root, ch.file);
    const snippet = readFileSnippet(absPath, maxCharsPerFile);
    if (!snippet) continue;

    usedFilesSet.add(ch.file);
    contextBlocks.push(
      `FILE: ${ch.file} [${ch.start}-${ch.end}]
-----
${snippet}
-----`,
    );
  }

  const usedFiles = Array.from(usedFilesSet);

  if (contextBlocks.length === 0) {
    // Fallback: no readable chunks, so just use question.
    return {
      prompt: question,
      usedFiles: [],
    };
  }

  const contextText = contextBlocks.join('\n\n');

  const prompt =
    'You are a helpful assistant for answering questions about this codebase.\n' +
    'You are given a set of file snippets as context. Use them when relevant, ' +
    'but do not hallucinate details that are not supported by the snippets.\n\n' +
    'Context:\n' +
    contextText +
    '\n\nQuestion: ' +
    question +
    '\n\nAnswer in a concise way and, when useful, mention which files you are using.';

  return { prompt, usedFiles };
}

export async function buildPromptWithContext(
  question: string,
  options: BuildContextOptions = {},
): Promise<{ prompt: string; usedFiles: string[] }> {
  const startDir = options.startDir ?? process.cwd();
  const maxFiles = options.maxFiles ?? 5;
  const maxCharsPerFile = options.maxCharsPerFile ?? 2000;

  const index = loadIndex(startDir);
  if (!index) {
    // No index available; fall back to plain question.
    const fallbackPrompt =
      'You are a helpful assistant for answering questions about code. ' +
      'No repository index is available, so rely only on the question.\n\n' +
      `Question: ${question}`;

    return { prompt: fallbackPrompt, usedFiles: [] };
  }

  const embeddingChunks = loadEmbeddingIndex(index);

  if (embeddingChunks && embeddingChunks.length > 0) {
    return await buildPromptFromEmbeddings(
      question,
      index,
      embeddingChunks,
      maxCharsPerFile,
    );
  }

  const keywords = extractKeywords(question);
  const selected = selectFilesByPath(index, keywords, maxFiles);

  if (selected.length === 0) {
    const prompt =
      'You are a helpful assistant for answering questions about this codebase. ' +
      'No specific files matched the question keywords; answer based only on the question.\n\n' +
      `Question: ${question}`;

    return { prompt, usedFiles: [] };
  }

  const contextBlocks: string[] = [];
  const usedFiles: string[] = [];

  for (const file of selected) {
    const snippet = readFileSnippet(file.absPath, maxCharsPerFile);
    if (!snippet) continue;

    usedFiles.push(file.relPath);
    contextBlocks.push(
      `FILE: ${file.relPath}
-----
${snippet}
-----`,
    );
  }

  const contextText = contextBlocks.join('\n\n');

  const prompt =
    'You are a helpful assistant for answering questions about this codebase.\n' +
    'You are given a set of file snippets as context. Use them when relevant, ' +
    'but do not hallucinate details that are not supported by the snippets.\n\n' +
    'Context:\n' +
    contextText +
    '\n\nQuestion: ' +
    question +
    '\n\nAnswer in a concise way and, when useful, mention which files you are using.';

  return { prompt, usedFiles };
}
