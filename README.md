# Repomind

A local-first AI assistant that helps you explore and understand your code repositories.

- **No server**: everything runs on your machine.
- **Local LLM**: uses [Ollama](https://ollama.com/) (or another local server) for inference.
- **Context-aware**: indexes your repo and injects relevant file snippets into the prompt.

> Status: early MVP. The tool currently supports:
> - Building a simple index of your repo files.
> - Optionally building an embedding index for semantic search.
> - Asking questions that use repo context from file paths or embeddings.

---

## Requirements

- **Node.js**: v18 or higher (for built-in `fetch` support).
- **Ollama**: running locally to host the LLM model.

---

## Installation

For now, install via `npm` (global install):

```bash
npm install -g repomind
```

If you are developing locally in this repo:

```bash
# from the repo root
npm install
npm run build
npm link   # makes the `repomind` command available globally
```

After this, you should be able to run:

```bash
repomind --help
```

---

## Setting up Ollama

repomind expects an Ollama server running at `http://localhost:11434`.

### 1. Install Ollama

On macOS (recommended):

```bash
brew install ollama
```

Or download it from the Ollama website and follow their installation instructions.

### 2. Start the Ollama server

In a terminal:

```bash
ollama serve
```

This will start the local API server at `http://localhost:11434`.

You can keep this running in the background or in a separate terminal window.

### 3. Choose and download a model

repomind allows you to specify any model name that Ollama knows about, via the `--model` flag on the `ask` command.

For a good balance of capability and speed, a small instruction-tuned model is recommended. Some options:

- `llama3` (or a variant like `llama3:instruct`) – general-purpose, good default.
- `codellama` / `codellama:instruct` – more code-oriented, might work better for code-heavy questions.

To download a model with Ollama:

```bash
ollama pull llama3
# or
ollama pull codellama
```

You only need to pull each model once. After that, Ollama will keep it locally.

---

## Basic usage

### 1. Index your repository

From the root of the repository you want to explore:

```bash
cd /path/to/your/project
repomind index .
```

This will:

- Walk the directory tree under `.`.
- Skip common build and tooling directories (`node_modules`, `.git`, `dist`, etc.).
- Record basic metadata for code-like files (`.ts`, `.js`, `.py`, `.go`, `.rs`, `.java`, `.cs`, etc.).
- Write a JSON index file at:

```bash
/path/to/your/project/.repomind-index.json
```

You can optionally:

- Build an **embedding index** (semantic search) at the same time:

  ```bash
  repomind index . --with-embeddings
  ```

  This will create a `.repomind-vec.json` file alongside `.repomind-index.json` with per-chunk embeddings.
  For this, you should pull an embedding model in Ollama, for example:

  ```bash
  ollama pull nomic-embed-text
  ```

- Specify a custom output path:

  ```bash
  repomind index . --output /tmp/my-index.json
  ```

- Include extra file extensions:

  ```bash
  repomind index . --ext .md .yml .yaml
  ```

### 2. Ask a question using the index

Make sure the index exists (see step above), then run:

```bash
repomind ask "Where is the indexer implemented?"
```

Behavior:

1. repomind looks for `.repomind-index.json`, walking up from your current directory.
2. It extracts simple keywords from your question.
3. It scores files whose **paths** contain those keywords.
4. It reads a small snippet from the top-matching files.
5. It builds a prompt that includes those snippets as context and sends it to Ollama.
6. It prints:
   - Which files were used as context.
   - The model's answer.

You should see something like:

```text
📎 Using context from files:
   - src/indexer.ts

🤔 Thinking...

=== repomind ===
<model answer here>
```

If no index is found or no files match the keywords, you'll see:

```text
ℹ️ No index or matching files found; answering from question only.
```

In that case, the model will answer purely from the question text without repo context.

### 3. Choosing a specific model

By default, `repomind ask` uses the `llama3` model name when talking to Ollama.

You can override this with the `--model` (or `-m`) flag:

```bash
repomind ask "Explain the index format" --model codellama
```

Make sure you have pulled that model first:

```bash
ollama pull codellama
```

You can use any model Ollama supports, as long as it is:

- Instruction-tuned (chat/assistant style) for best results.
- Reasonably sized for your machine's RAM/CPU/GPU.

Examples:

```bash
repomind ask "How does indexing work?" -m llama3
repomind ask "Summarize the project structure" -m codellama
```

---

## Commands summary

```bash
repomind --help
repomind index [path] [--output <output>] [--ext <ext...>]
repomind ask <question...> [--model <model>]
```

- `index [path]`
  - Index the repository at `path` (default: `.`).
  - Writes `.repomind-index.json` in the repo root by default.
  - Options:
    - `--output <output>`: custom index file path.
    - `--ext <ext...>`: extra file extensions to include.
    - `--with-embeddings`: also build `.repomind-vec.json` using Ollama embeddings.

- `ask <question...>`
  - Ask a natural-language question.
  - Uses `.repomind-index.json` if available to provide context.
  - Options:
    - `--model <model>` / `-m <model>`: Ollama model name (default: `llama3`).

---

## Development

Clone the repo and set up the project:

```bash
git clone git@github.com:patravishek/repomind.git
cd repomind
npm install
npm run build
npm link
```

Now you can run the CLI from anywhere:

```bash
repomind index .
repomind ask "What does the indexer do?"
```

To iterate on the TypeScript source with automatic rebuilds:

```bash
npm run watch
```

Then in another terminal, run the CLI as usual.

---

## Roadmap (ideas)

- Use embeddings instead of simple path keyword matching.
- Smarter chunking of files (by function/class instead of whole-file snippets).
- Model-agnostic backend (support for other local engines in addition to Ollama).
- Homebrew formula for easy installation (`brew install repomind`).
- Optional VS Code or JetBrains plugin integrating the CLI.

Contributions and issues are welcome.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
