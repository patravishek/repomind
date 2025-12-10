import { Command } from 'commander';
import { askOllama, checkOllamaHealth } from './ollamaClient';
import { buildRepoIndex } from './indexer';
import { buildPromptWithContext } from './context';

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
      const { prompt, usedFiles } = buildPromptWithContext(question, {
        startDir: process.cwd(),
      });

      if (usedFiles.length > 0) {
        console.log('📎 Using context from files:');
        for (const f of usedFiles) {
          console.log(`   - ${f}`);
        }
        console.log();
      } else {
        console.log('ℹ️ No index or matching files found; answering from question only.');
        console.log();
      }

      console.log('🤔 Thinking...\n');
      const answer = await askOllama({ model: options.model, prompt });
      console.log('=== repomind ===\n');
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
  .action((pathArg: string, options: { output?: string; ext?: string[] }) => {
    const rootDir = pathArg || '.';

    console.log(`📚 Building index for: ${rootDir}`);
    try {
      const index = buildRepoIndex({
        rootDir,
        outputPath: options.output,
        extraExtensions: options.ext,
      });

      console.log(`✅ Indexed ${index.entries.length} files.`);
      console.log(`📄 Index written to: ${options.output ?? `${index.root}/.repomind-index.json`}`);
    } catch (err) {
      const error = err as Error;
      console.error('❌ Failed to build index:', error.message || error);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
