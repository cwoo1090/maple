# AI Study Wiki Builder

A desktop app concept for turning study sources into a local, AI-maintained learning wiki.

The initial product direction is:

- Target users: students and self-learners who are not familiar with open source tools, Obsidian, terminal workflows, or agent CLIs.
- AI model access: use the user's ChatGPT subscription through OpenAI Codex, rather than charging for API usage in the first MVP.
- Storage: plain local files, so the user's knowledge base is portable and inspectable.
- Core workflow: add sources, build wiki, see changed files, undo if needed, and study from the compiled pages.

## MVP Shape

```text
Open app
-> Create workspace
-> Connect ChatGPT
-> Add PDF / Markdown / text / links
-> Build wiki
-> See changed files
-> Study from the generated wiki
```

## Suggested Folder Model

```text
workspace/
  raw/
  wiki/
    concepts/
    summaries/
    guides/
    assets/
  index.md
  log.md
  schema.md
  AGENTS.md
  .studywiki/
```

## Project Docs

- [Product Brief](docs/product-brief.md)
- [MVP Spec](docs/mvp-spec.md)
- [MVP Plan](docs/mvp-plan.md)
- [Karpathy LLM Wiki Background](docs/karpathy-llm-wiki-background.md)
- [Technical Spike](docs/technical-spike.md)
