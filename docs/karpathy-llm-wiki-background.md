# Karpathy LLM Wiki Background

Source: [Andrej Karpathy, `llm-wiki.md`](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), created April 4, 2026.

This note summarizes the product-relevant parts of Karpathy's LLM Wiki pattern for the AI Study Wiki Builder project. It is intentionally a paraphrased working note, not a copy of the original gist.

## Core Pattern

The pattern is a shift from document chat to knowledge compilation.

Typical RAG-style tools retrieve chunks from raw files when a question is asked. That helps answer the current question, but the system often re-derives the same understanding every time. The LLM Wiki pattern instead asks the LLM to maintain a persistent, structured Markdown wiki between the user and the raw sources.

When new material is added, the LLM should not merely index it. It should read it, summarize it, integrate it into existing pages, update cross-links, flag contradictions, and strengthen the current synthesis.

## Three Layers

1. `raw/`
   - Curated source material.
   - Treated as immutable.
   - Examples: PDFs, slides, transcripts, articles, notes, data files, images.

2. `wiki/`
   - LLM-generated Markdown knowledge base.
   - Contains summaries, concepts, entities, guides, comparisons, syntheses, and other useful study artifacts.
   - The LLM owns maintenance of this layer, while the user reads, reviews, and directs it.

3. Schema / agent instructions
   - A file such as `AGENTS.md`, `schema.md`, or similar.
   - Defines folder structure, page conventions, workflows, source citation rules, and maintenance behavior.
   - This turns the LLM from a generic chatbot into a disciplined wiki maintainer.

## Important Operations

### Ingest

The user adds a source to `raw/`, then asks the LLM to process it.

A good ingest can:
- create or update a source summary,
- create or update concept pages,
- add links between related ideas,
- update `index.md`,
- append an entry to `log.md`,
- surface contradictions or uncertainties,
- ask the user what to emphasize when needed.

Karpathy notes that a single source may touch many wiki files. For this product, that means ingestion should be treated as a reviewable change set, not as a hidden background action.

### Query

The user asks questions against the wiki.

The LLM should search or read the existing wiki first, then answer from the compiled knowledge base with source-grounded references where possible. Strong answers, comparisons, explanations, or study artifacts should be optionally saved back into the wiki.

For this app, chat should be **read-only by default**. Wiki edits should happen only when the user explicitly asks to apply the conversation to the wiki or accepts a proposed update.

### Lint

The LLM periodically checks wiki health.

Useful lint checks include:
- contradictions between pages,
- stale claims superseded by newer sources,
- orphan pages,
- missing inbound or outbound links,
- important concepts mentioned but not yet promoted to their own page,
- missing source citations,
- weak or incomplete summaries,
- `index.md` drift,
- schema violations.

For this product, lint should become a visible operation, not an invisible maintenance mode.

## Navigation Files

### `index.md`

Content-oriented catalog of wiki pages. It should list pages with short descriptions and enough organization for both users and LLMs to find the right material quickly.

The LLM should read the index first when answering questions or planning updates.

### `log.md`

Chronological append-only history of wiki operations.

It should record ingests, accepted applied-chat updates, lint passes, and important maintenance actions. Consistent headings make the log easy for both humans and simple scripts to parse.

## Product Implications

This project should not become a generic Markdown editor or a basic PDF chatbot. The central promise is:

> A learner can feed scattered study sources into the app and get a maintained, source-grounded study wiki that compounds over time.

The first app workflow should therefore emphasize:
- creating a local learning workspace,
- importing raw study materials,
- running an explicit ingest operation,
- reviewing generated file changes,
- browsing the compiled wiki,
- chatting read-only by default,
- applying useful chat insights to the wiki only with user intent,
- running lint to improve structure and reliability.

## Relationship To Robot Hardware Wiki

The local `robot-hardware-wiki` is a concrete example of this pattern:
- `raw/` contains lecture materials, papers, datasheets, and notes,
- `wiki/concepts/` contains canonical explanations,
- `wiki/summaries/` contains source summaries,
- `wiki/guides/` contains study paths,
- `index.md` catalogs pages,
- `log.md` tracks operations,
- `schema.md` defines conventions,
- raw sources are immutable,
- generated wiki changes are intended to be reviewable.

The AI Study Wiki Builder MVP can be understood as a desktop app that helps a non-technical user create and maintain a similar wiki without needing Git, Obsidian setup, terminal commands, or direct agent prompt engineering.

## Current Product Decisions

- First demo should likely be based on a lecture bundle: slides/PDF, transcript, links, and notes.
- Chat should be read-only by default.
- The user should explicitly trigger wiki writes through actions such as "Build wiki", "Apply to wiki", or "Clean up wiki".
- Generated changes should be marked after the operation and undoable.
- `Healthcheck wiki` and `Clean up wiki` should be first-class app operations.
- The app should detect when files have been added or changed under `raw/` and use that state to enable or emphasize the Build wiki action.
- The user should be able to add several raw materials first, then run one explicit Build wiki operation over the detected raw changes.
- Graph view is MVP-required because wikilinks and visual knowledge navigation are central to the study value.

## Raw Change Detection Requirement

The app should treat `raw/` as an inbox for study sources.

When the user adds, removes, renames, or changes files under `raw/`, the UI should notice that the raw source set differs from the last built wiki state. That difference should make the Build wiki button available and visually prominent.

The first MVP can implement this with a simple local manifest rather than a complex database. For example, after each successful Build wiki operation, the app records a snapshot of raw file paths, file sizes, modified times, and optionally content hashes. On later app launches or filesystem events, it compares the current raw snapshot against the last built snapshot.

Possible source states:

- `new`: raw file exists now but was not present at last successful Build wiki operation.
- `modified`: raw file path existed before, but size/hash/modified time changed.
- `removed`: raw file existed at last successful Build wiki operation but no longer exists.
- `unchanged`: raw file matches the last built snapshot.

Because raw files are supposed to be immutable after import, a modified raw file should be shown carefully. The app may suggest importing it as a new version rather than silently treating it as the same source.

The Build wiki button should not mean "scan everything every time." It should mean:

> Compile the currently unprocessed raw changes into the wiki, mark the files changed by the operation, and make the operation undoable.

This mirrors the `robot-hardware-wiki` workflow, where raw lecture bundles such as slides, transcripts, and notes are dropped into `raw/lectures/lecture-XX/`, then the LLM creates or updates summaries, concepts, guides, `index.md`, and `log.md`.

## Web Link Handling

The existing `robot-hardware-wiki` uses Obsidian Web Clipper-style Markdown files as raw web sources. That is useful background, but this app should not require users to know or install web clippers.

Most users should be able to paste a link directly into the app.

Example shape:

```yaml
---
title: "Difference Between BLDC Motor and PMSM Motor"
source: "https://example.com/article"
author:
  - "[[Publisher]]"
published: 2024-02-23
created: 2026-04-11
description: "Short page description"
tags:
  - "clippings"
---
```

The app should create a raw Markdown source from pasted links. The target shape can stay similar to clipped Markdown:

MVP paste-link flow:

1. User chooses `Add source` -> `Web link`.
2. User pastes a URL.
3. App tries to fetch the page and extract readable article content.
4. If extraction succeeds, app saves a Markdown snapshot under `raw/web-clips/` or the selected raw folder.
5. If extraction fails, app clearly tells the user that the page could not be captured and asks them to paste the relevant text manually or save the source another way.
6. The created raw Markdown file is detected as a pending source and can be ingested.

Extraction failure should not be hidden and should not result in a misleading empty source. A useful failure message:

> We could not capture readable text from this link. Paste the relevant text manually, upload a PDF, or try another source.

The app can still save a small link note if the user wants, but it should not imply that the LLM has access to the page content unless content was actually captured.

The app should also accept Markdown clips created by external tools if users already have them, but that is an compatibility path, not the primary product workflow.

Special care: captured pages may include remote images or very large embedded base64 images. The app should render what it can, but ingest should avoid copying huge base64 blobs into wiki pages. If an image is important for study, the LLM/app should save a selected derived asset under `wiki/assets/` and cite the original raw web source.
