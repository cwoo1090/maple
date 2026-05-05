# Maple

A desktop app concept for turning sources into a local, AI-maintained wiki.

The initial product direction is:

- Target users: students and self-learners who are not familiar with open source tools, Obsidian, terminal workflows, or agent CLIs.
- AI model access: use the user's ChatGPT subscription through OpenAI Codex, rather than charging for API usage in the first MVP.
- Storage: plain local files, so the user's knowledge base is portable and inspectable.
- Core workflow: add sources, build wiki, explore the compiled pages, maintain the wiki structure, see changed files, and undo if needed.

## MVP Shape

```text
Open app
-> Create workspace
-> Connect ChatGPT
-> Add PDF / Markdown / text / links
-> Build wiki
-> See changed files
-> Explore the generated wiki
-> Run a wiki healthcheck or improve the wiki when it grows
```

## Suggested Folder Model

```text
workspace/
  sources/
  wiki/
    concepts/
    summaries/
    guides/
    assets/
  index.md
  log.md
  schema.md
  AGENTS.md
  .aiwiki/
```

## Project Docs

- [Product Brief](docs/product-brief.md)
- [MVP Spec](docs/mvp-spec.md)
- [MVP Plan](docs/mvp-plan.md)
- [Karpathy LLM Wiki Background](docs/karpathy-llm-wiki-background.md)
- [Technical Spike](docs/technical-spike.md)
- [macOS Release Checklist](docs/release-macos.md)

## Download Site

The static download page lives in [site](site/). Open `site/index.html` in a
browser, or deploy that folder to a static host.
