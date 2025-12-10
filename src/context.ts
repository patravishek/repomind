import fs from 'fs';
import path from 'path';
import { RepoIndex } from './types';

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

export function buildPromptWithContext(
  question: string,
  options: BuildContextOptions = {},
): { prompt: string; usedFiles: string[] } {
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
