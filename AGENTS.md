# AGENTS.md

This project is a desktop app concept for a non-technical student/self-learner audience.

## Product Direction

Build an AI study wiki builder, not a generic markdown editor.

The app should make this workflow simple:

1. Create a learning workspace.
2. Import study sources.
3. Use ChatGPT/Codex to compile the sources into a local wiki.
4. Review AI-generated changes.
5. Study from the generated wiki.

## MVP Constraints

- Prefer the fastest path to a working demo.
- Use the user's ChatGPT/Codex subscription for the first MVP.
- Do not introduce app accounts, payments, sync, or built-in API billing unless explicitly requested.
- Keep storage local and file-based.
- Keep the UI approachable for users who do not know terminal workflows, Obsidian, Git, or open source tooling.

## Workspace Model

Use this workspace shape unless changed later:

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
```

## Engineering Notes

- Raw imported sources should be treated as immutable.
- AI-generated changes should be reviewable before acceptance.
- Prefer simple, boring architecture over plugin-heavy abstractions for the MVP.
- Start with macOS if platform tradeoffs are needed; add Windows after the core spike works.

