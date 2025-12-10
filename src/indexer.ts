import fs from 'fs';
import path from 'path';
import { IndexEntry, RepoIndex } from './types';

// File extensions we consider as "code" for v0.
const DEFAULT_CODE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.cs',
  '.php',
  '.rb',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.swift',
  '.kt',
  '.kts',
];

// Directories we skip when indexing.
const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.idea',
  '.vscode',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  // Common Python virtualenv / cache dirs
  '.venv',
  'venv',
  '.tox',
  '__pycache__',
]);

export interface IndexOptions {
  /**
   * Root directory of the repo to index.
   */
  rootDir: string;
  /**
   * Path where the index JSON should be stored.
   */
  outputPath?: string;
  /**
   * Additional file extensions to include.
   */
  extraExtensions?: string[];
}

function isCodeFile(filePath: string, exts: string[]): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return exts.includes(ext);
}

function walkDir(rootDir: string, exts: string[]): IndexEntry[] {
  const entries: IndexEntry[] = [];

  function walk(currentDir: string) {
    const dirents = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const dirent of dirents) {
      const fullPath = path.join(currentDir, dirent.name);
      const relPath = path.relative(rootDir, fullPath);

      if (dirent.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(dirent.name)) {
          continue;
        }
        walk(fullPath);
        continue;
      }

      if (!dirent.isFile()) {
        continue;
      }

      if (!isCodeFile(fullPath, exts)) {
        continue;
      }

      try {
        const stat = fs.statSync(fullPath);
        const ext = path.extname(fullPath).toLowerCase();

        entries.push({
          path: relPath || dirent.name,
          size: stat.size,
          ext,
        });
      } catch {
        // Ignore files we cannot stat
      }
    }
  }

  walk(rootDir);
  return entries;
}

export function buildRepoIndex(options: IndexOptions): RepoIndex {
  const rootDir = path.resolve(options.rootDir);
  const exts = Array.from(
    new Set([...(options.extraExtensions ?? []), ...DEFAULT_CODE_EXTENSIONS]),
  );

  const entries = walkDir(rootDir, exts);

  const index: RepoIndex = {
    root: rootDir,
    generatedAt: new Date().toISOString(),
    entries,
  };

  const outputPath = options.outputPath ?? path.join(rootDir, '.repomind-index.json');

  try {
    fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), 'utf8');
  } catch (err) {
    throw new Error(`Failed to write index file at ${outputPath}: ${(err as Error).message}`);
  }

  return index;
}
