import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { askOllama, checkOllamaHealth } from './ollamaClient';
import { buildRepoIndex } from './indexer';
import { buildPromptWithContext } from './context';
import { buildEmbeddingIndex } from './embeddingIndex';

const colors = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

function startSpinner(text: string): () => void {
  const frames = ['⠋', '⠙', '⠚', '⠞', '⠖', '⠦', '⠴', '⠲', '⠳', '⠓'];
  let i = 0;
  const interval = setInterval(() => {
    const frame = frames[(i = (i + 1) % frames.length)];
    process.stdout.write(`\r${frame} ${text}   `);
  }, 80);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    process.stdout.write('\r');
  };
}

const program = new Command();

program
  .name('repomind')
  .description('Local AI assistant to explore and understand your code repositories.')
  .version('0.0.1');

program
  .command('ask')
  .description('Ask a question to your local LLM (e.g. Ollama).')
  .argument('<question...>', 'The question to ask')
  .option('-m, --model <model>', 'Ollama model name', 'llama3')
  .action(async (questionParts: string[], options: { model: string }) => {
    const question = questionParts.join(' ');

    const isHealthy = await checkOllamaHealth();
    if (!isHealthy) {
      console.error('❌ Cannot reach Ollama at http://localhost:11434');
      console.error('   Make sure Ollama is running: brew install ollama && ollama serve');
      process.exitCode = 1;
      return;
    }

    try {
      const { prompt, usedFiles, rootDir } = await buildPromptWithContext(
        question,
        {
          startDir: process.cwd(),
        },
      );

      if (usedFiles.length > 0) {
        const baseDir = rootDir ?? process.cwd();
        console.log(colors.bold('📎 Using context from files:\n'));
        for (const f of usedFiles) {
          const absPath = path.isAbsolute(f)
            ? f
            : path.join(baseDir, f);
          const displayPath = path.relative(process.cwd(), absPath) || absPath;

          // Many terminals/editors support Cmd+Click on "path:line" format.
          console.log(colors.cyan(`   ${displayPath}:1`));

          try {
            const content = fs.readFileSync(absPath, 'utf8');
            const lines = content.split('\n');
            const previewLines = lines.slice(0, 10);

            for (const line of previewLines) {
              console.log(colors.dim(`     ${line}`));
            }
            if (lines.length > 10) {
              console.log(colors.dim('     ...'));
            }
          } catch {
            // If we can't read the file, just skip the snippet preview.
          }

          console.log();
        }
      } else {
        console.log(
          colors.dim(
            'ℹ️ No index or matching files found; answering from question only.\n',
          ),
        );
      }

      const stopSpinner = startSpinner(
        `Thinking with model ${options.model}...`,
      );
      const answer = await askOllama({ model: options.model, prompt });
      stopSpinner();
      console.log(`\n${colors.bold('=== repomind ===')}\n`);
      console.log(answer.trim());
      console.log();
    } catch (err) {
      const error = err as Error;
      console.error('❌ Error talking to local LLM:', error.message || error);
      process.exitCode = 1;
    }
  });

program
.command('index')
  .description('Index a repository for context-aware queries.')
  .argument('[path]', 'Path to repository', '.')
  .option('-o, --output <output>', 'Path to index JSON file (default: .repomind-index.json in repo root)')
  .option(
    '-e, --ext <ext...>',
    'Extra file extensions to include (e.g. .md .yml)',
  )
  .option(
    '--with-embeddings',
    'Also build an embedding index using Ollama (writes .repomind-vec.json)',
  )
  .action(async (
    pathArg: string,
    options: { output?: string; ext?: string[]; withEmbeddings?: boolean },
  ) => {
    const rootDir = pathArg || '.';

    console.log(`📚 Building index for: ${rootDir}`);
    try {
      const index = buildRepoIndex({
        rootDir,
        outputPath: options.output,
        extraExtensions: options.ext,
      });

      console.log(`✅ Indexed ${index.entries.length} files.`);
      console.log(
        `📄 Index written to: ${
          options.output ?? `${index.root}/.repomind-index.json`
        }`,
      );

      if (options.withEmbeddings) {
        console.log('📐 Building embedding index (this may take a while)...');
        await buildEmbeddingIndex({ rootDir: index.root, index });
        console.log('✅ Embedding index written to .repomind-vec.json');
      }
    } catch (err) {
      const error = err as Error;
      console.error('❌ Failed to build index:', error.message || error);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
