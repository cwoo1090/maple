# MVP Plan

## Goal

Build the smallest desktop app that proves this workflow:

> A non-technical learner can create a local wiki workspace, add sources, build a structured wiki with Codex, explore through wikilinks and graph navigation, and safely undo AI write operations.

See [`mvp-spec.md`](./mvp-spec.md) for the detailed product specification. This plan is the shorter execution-oriented version.

## Explicit Non-Goals

Do not build these in the first MVP:

- payments
- user accounts
- cloud sync
- collaboration
- mobile app
- flashcards
- plugin system
- built-in AI credits
- multi-provider support
- full Markdown editor
- Obsidian replacement scope
- Git-first review/history workflow
- browser extension/web clipper

Graph view is no longer a non-goal. It is required for MVP because wikilink navigation is central to the product.

## Platform

Recommended order:

1. macOS first
2. Windows second

## Stack

Recommended MVP stack:

- Desktop shell: Tauri
- UI: React + TypeScript
- AI execution: OpenAI Codex CLI run as bounded background jobs
- Storage: plain local workspace folder
- Markdown rendering: local Markdown parser with wikilink support
- PDF: in-app preview plus extraction/cache pipeline
- Graph: React graph library based on parsed wikilinks

## Workspace Model

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

Portable/shareable content:

```text
sources/
wiki/
index.md
log.md
schema.md
AGENTS.md
```

`.aiwiki/` is local app metadata for manifests, extraction caches, operations, and snapshots. It should be excluded from export/share.

## Main App Areas

Use these user-facing areas:

- `Sources` in the left file panel
- `Explore` in the right panel
- `Maintain` in the right panel

Use these user-facing action labels:

- `Build wiki`
- `Apply to wiki`
- `Wiki healthcheck`
- `Improve wiki`
- `Organize sources`
- `Update rules`
- `Undo last operation`

Avoid exposing "ingest", "lint", "diff", "Git", terminal wording, `AGENTS.md`, `CLAUDE.md`, or `schema.md` in the normal UX.

## MVP Features

### 1. Workspace Creator

- Ask only: "What are you exploring?"
- Suggest default location: `~/Documents/Maple Wikis/<workspace-name>`.
- Allow the user to change location.
- Generate `sources/`, `wiki/`, `index.md`, `log.md`, `schema.md`, `AGENTS.md`, and `.aiwiki/`.
- Support opening an existing compatible workspace.
- If an existing workspace lacks `.aiwiki/`, add it without changing wiki content.

### 2. Connect ChatGPT / Codex

- Detect whether Codex CLI is installed.
- Detect whether the user is signed in with ChatGPT.
- If Codex is missing on macOS, offer `Install in Terminal` using:

```bash
npm i -g @openai/codex
```

- If Codex is installed but logged out, offer `Sign in with ChatGPT` using:

```bash
codex login
```

- Provide copyable commands and official help links as fallback.

### 3. Sources

- Show `sources/` as a nested file tree, not a flat upload list.
- Support drag/drop import.
- Allow direct Finder-managed source files.
- Support create folder, rename, move, delete with confirmation, reveal in Finder, and open in default app.
- Detect pending source changes anywhere under `sources/`.
- Show pending states such as `new`, `modified`, `removed`, and `already built`.
- Suggest bundles from folders, such as a lecture folder containing slides, transcript, and notes.
- Let the user build all pending sources by default or selected files/folders.

### 4. Source Capture And Preview

Support:

- PDF / lecture slides
- Markdown
- TXT / transcripts
- images
- pasted text
- pasted web links

PDF preview is required in the center pane.

For pasted text, use a paste-first minimal UX:

```text
Paste anything here
[Save source]
```

The app infers title, filename, type, and save location. Optional fields can be hidden under advanced options.

For web links, the app tries to extract readable content into a source Markdown snapshot. If extraction fails, clearly tell the user to paste text manually, upload a PDF, or try another source. Do not pretend an uncaptured page has been ingested.

### 5. Build Wiki

When pending sources exist, emphasize:

```text
5 new sources ready
[Build wiki]
```

Build wiki should:

- create a hidden snapshot first
- use a thin prompt that scopes pending sources and lets the LLM read workspace context files as needed
- create or update summaries
- create or update concept pages
- create or update guides
- update `index.md`
- append to `log.md`
- update `schema.md` only when there is clear durable-rule intent
- create useful derived visual assets under `wiki/assets/<source-slug>/`
- mark changed files after completion
- offer undo

There is no accept/discard review step in MVP. Changes are applied, marked, and undoable.

### 6. PDF Extraction And Visual Assets

The app should prepare PDF context instead of relying on source PDF handling alone:

- extract text when available
- render pages/thumbnails
- automatically detect visually important or low-text pages
- cache helper files under `.aiwiki/extracted/`
- provide text plus selected page images to AI operations

Build wiki should automatically create curated visual assets:

```text
source PDF/image
-> selected derived PNGs in wiki/assets/<source-slug>/
-> embedded in relevant wiki pages
-> captions cite original source path + page/slide/figure
```

Do not dump every slide into the wiki. Use visuals only when they improve understanding.

### 7. Explore

- Chat is read-only by default.
- Answers should use `index.md`, `wiki/`, and sources when needed.
- The user can explicitly run `Apply to wiki`.
- Apply to wiki uses the same snapshot, changed-file marking, permission validation, and undo model as Build wiki.
- Wiki pages are read-only in the app for MVP.
- Provide file actions such as `Open in default app` and `Reveal in Finder`.

### 8. Wiki Reader

- Render Markdown.
- Render YAML frontmatter/properties cleanly.
- Render tags and source references.
- Render LaTeX math when present.
- Render images from `wiki/assets/`.
- Support clickable wikilinks:
  - `[[page-name]]`
  - `[[page-name|label]]`
- Resolve links across `wiki/concepts/`, `wiki/summaries/`, and `wiki/guides/`.
- Show broken wikilinks clearly.
- Provide back/forward page navigation.

### 9. Graph View

Graph view is MVP-required.

Required behavior:

- wiki pages only for MVP
- nodes for concepts, summaries, and guides
- edges from wikilinks
- local graph centered on current page as default
- global graph as a tab/view
- current page highlighted
- click node to open page
- broken links shown distinctly

Source nodes can come later.

### 10. Connections Panel

When feasible, show a compact current-page neighborhood:

- outgoing links
- backlinks
- related tags

This helps users move through the wiki without needing the full graph every time.

### 11. Maintain

User-facing actions:

- `Wiki healthcheck`: rule-based lint/fix operation with snapshot, changed-file marking, permission validation, and undo
- `Improve wiki`: user-directed wiki improvement, guide creation, and restructuring
- `Organize sources`: user-directed source folder/file moves and renames without source content edits
- `Update rules`: update durable workspace rules shown to the user as one rules surface

Wiki healthcheck should inspect:

- orphan pages
- broken wikilinks
- missing cross-links
- duplicate concepts
- missing source citations
- weak summaries
- stale `index.md`
- schema/log drift
- contradictions or unresolved warnings

### 12. Operation Safety

All AI write operations use:

- hidden snapshot
- changed-file detection
- mode-specific write allowlist
- forbidden change restoration/blocking
- operation report
- undo last operation

Operations are permission boundaries:

- Explore may write `wiki/**`, `index.md`, `log.md`, and `schema.md` only when explicitly requested.
- Organize sources may organize `sources/` paths but should not edit source file content.
- Build wiki may write `wiki/**`, `index.md`, `log.md`, `schema.md`, `wiki/assets/**`, and `.aiwiki/**`.
- Wiki healthcheck and Improve wiki may inspect/fix wiki/control files but may not modify `sources/**`.

## Technical Spike Before UI

Before building the full Tauri UI, prove the operation model with a small local spike:

1. Create a fresh sample workspace.
2. Detect Codex install/login.
3. Run `codex exec`.
4. Snapshot before operation.
5. Detect changed files.
6. Validate allowed paths.
7. Undo last operation.

Then test against a copy of `robot-hardware-wiki`, never the original.

## First Demo Acceptance Criteria

- User can create a workspace from "What are you exploring?"
- User can choose default or custom workspace location.
- App can detect Codex install/login and guide setup.
- User can add at least PDF and pasted text sources.
- App detects pending source changes.
- User can preview source PDFs in app.
- User can click `Build wiki`.
- Codex creates/updates wiki pages, `index.md`, and `log.md`.
- App marks changed files after the operation.
- User can undo the last operation.
- Wiki reader renders Markdown, properties, images, math, and wikilinks.
- Graph view works from wikilinks.
- Explore chat is read-only by default.
- User can explicitly `Apply to wiki`.
- User can run `Wiki healthcheck`.
- User can run `Improve wiki`, `Organize sources`, and `Update rules`.
- App enforces mode permissions and blocks forbidden changes.
