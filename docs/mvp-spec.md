# MVP Spec

## Product

AI Study Wiki Builder is a local desktop app that helps non-technical students and self-learners turn scattered study material into a maintained, source-grounded wiki.

The product is not a generic Markdown editor, Obsidian replacement, or PDF chatbot. It is a friendlier app wrapper around the LLM Wiki pattern: raw sources stay immutable, while AI compiles and maintains summaries, concept pages, study guides, wikilinks, assets, `index.md`, `log.md`, and `schema.md`.

The first concrete reference workflow is the existing `robot-hardware-wiki`: lecture slides, transcripts, notes, papers, and web material are dropped into `raw/`, then an LLM builds a structured wiki from them.

## Target User

Primary users:

- students preparing for exams or lectures
- self-learners studying technical topics
- project/research learners organizing sources over weeks

They may have PDFs, lecture slides, links, transcripts, pasted notes, screenshots, papers, or ChatGPT conversations. They should not need to know Git, Obsidian setup, terminal workflows, open source agent tools, or prompt engineering.

## User-Facing Language

Use "wiki" as the core noun.

Main tabs:

- `Study`
- `Sources`
- `Wiki Health`

Main action labels:

- `Build wiki`, not `Ingest`
- `Apply to wiki`
- `Healthcheck wiki`
- `Clean up wiki`
- `Undo last operation`

Internal operation names may still use `ingest`, `apply-chat`, and `lint`.

## Workspace Model

New workspaces use this structure:

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

Portable/shareable workspace contents:

```text
raw/
wiki/
index.md
log.md
schema.md
AGENTS.md
```

Local app metadata:

```text
.studywiki/
```

`.studywiki/` is hidden, regeneratable, and excluded from export/share. If the workspace is a Git repo, `.studywiki/` should be ignored.

## Workspace Creation

The new workspace flow asks only one required question:

```text
What are you studying?
```

The app suggests a default location:

```text
~/Documents/Study Wikis/<workspace-name>
```

The user can change the location with a folder picker.

After creation, the app opens the workspace, likely starting in `Sources` because an empty workspace needs sources.

## Existing Workspaces

The app supports:

- create new wiki workspace
- open existing wiki workspace

When opening an existing workspace, the app checks for expected files/folders such as `raw/`, `wiki/`, `index.md`, `log.md`, `schema.md`, and `AGENTS.md`.

If `.studywiki/` is missing, the app may create it without changing wiki content. Existing `schema.md` and `AGENTS.md` are trusted by default. Updating workspace instructions should be an explicit optional maintenance action, not automatic.

## Main Layout

The main workspace UI is a three-pane layout:

```text
Left: workspace tree
  raw sources
  wiki pages
  pending source badges
  changed file badges

Center: selected content
  PDF preview
  Markdown/wiki reader
  text preview
  image preview
  graph view

Right: mode-specific agent/action panel
  Study chat
  Sources/build controls
  Wiki Health report/actions
  operation status
  undo
```

The app should feel like an agent workspace inspired by Codex CLI, but with non-technical guardrails and visible file/navigation UI.

## Modes And Permissions

Modes are not just UI tabs. They are permission boundaries.

### Study

Purpose: learn from the wiki and sources.

Default behavior:

- read-only chat
- answer from `index.md`, `wiki/`, and `raw/` when needed
- no file writes unless the user explicitly asks

Allowed write targets when explicitly requested:

- `wiki/**`
- `index.md`
- `log.md`
- `schema.md`
- `.studywiki/**`

Forbidden:

- modifying `raw/**`
- reorganizing raw files

Common actions:

- ask study questions
- render wiki pages
- use graph/wikilinks
- apply useful chat answer to wiki
- make/update study guide
- update `schema.md` only when the user expresses durable-rule intent such as "remember this rule" or "use this convention from now on"

### Sources

Purpose: add, organize, preview, and build from raw sources.

Allowed:

- drag/drop import into `raw/`
- paste text source into `raw/`
- paste web link and capture readable Markdown into `raw/`
- create raw folders
- rename raw files/folders
- move raw files/folders
- delete raw files/folders with confirmation
- organize pending raw files conversationally
- run `Build wiki`

Raw content remains immutable. In Sources mode, raw path changes are allowed, but raw file content edits are not.

Build wiki may write:

- `wiki/**`
- `index.md`
- `log.md`
- `schema.md`
- `wiki/assets/**`
- `.studywiki/**`

The user can give optional build instructions, but no instruction is required.

### Wiki Health

Purpose: inspect and improve wiki structure.

Actions:

- `Healthcheck wiki`: read-only report
- `Clean up wiki`: write operation

Allowed write targets for cleanup:

- `wiki/**`
- `index.md`
- `log.md`
- `schema.md`
- `.studywiki/**`

Forbidden:

- modifying or reorganizing `raw/**`

Health checks may inspect:

- orphan pages
- missing links
- broken wikilinks
- duplicate concepts
- missing source citations
- stale index entries
- log/schema drift
- weak summaries
- contradictions or unresolved warnings

## Mode Mismatch Behavior

If the user asks for an action outside the current mode, the assistant should explain the boundary and offer to switch.

Example in Study:

```text
That changes raw source organization, which belongs in Sources.
Switch to Sources and prepare a move plan?
```

Example in Wiki Health:

```text
Adding sources belongs in Sources.
Switch to Sources?
```

The app should also enforce permissions after operations. Prompt rules are advisory; filesystem validation is authoritative.

## Codex Setup

MVP uses Codex CLI with the user's ChatGPT/Codex login.

On launch or before first AI operation, the app checks:

```bash
command -v codex
codex --version
codex login status
```

If Codex is missing, the app shows a setup screen. On macOS, the app may offer `Install in Terminal`, which opens Terminal and runs:

```bash
npm i -g @openai/codex
```

If Codex is installed but logged out, the app offers `Sign in with ChatGPT`, which opens Terminal and runs:

```bash
codex login
```

The app should also provide copyable commands and official install/help links as fallback.

For the first spike, exposing Terminal through guided setup is acceptable. The real MVP should keep the setup transparent and as guided as possible.

## AI Execution Model

The first implementation should treat Codex as a bounded job runner, not as the full app UI.

For a write operation:

1. Build a mode-specific prompt.
2. Create a hidden snapshot.
3. Run `codex exec` in the selected workspace.
4. Stream progress/events.
5. Detect changed files.
6. Validate changes against the current mode's allowed paths.
7. Restore/block forbidden changes.
8. Mark changed files in the UI.
9. Record operation metadata.
10. Offer `Undo last operation`.

Representative command:

```bash
codex exec \
  --json \
  --cd <workspace> \
  --skip-git-repo-check \
  --sandbox workspace-write \
  --ask-for-approval never \
  "<operation prompt>"
```

Read-only operations should use read-only sandboxing where possible.

Long-term, the safer Pencil-like direction is an app-owned tool layer or MCP server where the AI manipulates the workspace through domain tools instead of free filesystem edits. The fast spike may use direct `codex exec` with snapshots and validation.

## AGENTS.md And schema.md

Every workspace should contain `AGENTS.md` and `schema.md`.

`AGENTS.md`:

- provides durable agent instructions
- tells Codex/other agents to treat `raw/` as immutable
- tells agents to read `schema.md` and `index.md`
- defines normal query as read-only
- requires `index.md` and `log.md` updates after wiki changes

`schema.md`:

- defines wiki conventions
- defines page frontmatter
- defines citation/linking/style rules
- can evolve as the user teaches the wiki

Study, Sources, and Wiki Health may edit `schema.md`, but only with clear intent or when a durable convention must be updated.

## Source Management

`raw/` is a real nested file tree, not a flat upload bucket.

The app supports:

- drag/drop files into the app
- adding files directly in Finder
- nested folders under `raw/`
- in-app raw tree
- create folder
- rename
- move
- delete with confirmation
- reveal in Finder
- open in default app
- select files/folders to build from

The app detects new/changed/removed raw files anywhere under `raw/`.

Possible raw states:

- `new`
- `modified`
- `removed`
- `unchanged`
- `already built`

Because raw files are supposed to be immutable, modified already-built raw files should be flagged carefully. The app may suggest importing the changed file as a new version.

## Pending Sources And Build Wiki

The app treats `raw/` as a source inbox.

When raw changes are detected, the Sources tab should emphasize that new material is ready:

```text
5 new sources ready
[Build wiki]
```

Build options:

- `Build wiki` / build all pending sources by default
- select files/folders to narrow scope
- suggested source bundles

Suggested bundles are inferred from folders. For example:

```text
raw/lectures/lecture-04/
  slides.pdf
  transcript.md
  notes.md
```

The app may present this as one lecture bundle. Bundles are suggestions, not a new storage abstraction.

Optional instruction box:

```text
Optional: tell the AI what to focus on.
```

No instruction is required. The app should use workspace name, path, filenames, `schema.md`, `index.md`, and `log.md` as context.

## Source Capture

Supported MVP source paths:

- PDF / slides
- Markdown
- TXT / transcript
- images
- pasted text
- pasted web link

### Pasted Text

Default UX should be paste-first and minimal:

```text
Paste anything here
[large text box]
[Save source]
```

The app infers title, filename, type, and save location. If a raw folder is selected, save there. Otherwise save to `raw/inbox/`.

Optional advanced fields may be collapsed:

- title
- save location
- source URL

After saving, the source becomes read-only and pending.

### Web Links

Users should not need external web clippers.

Flow:

1. User pastes URL.
2. App tries to fetch readable content.
3. If extraction succeeds, save a raw Markdown snapshot with URL metadata.
4. If extraction fails, show a clear message and ask the user to paste text manually, upload a PDF, or try another source.

Do not pretend the link was ingested if content was not captured.

Failure message:

```text
We could not capture readable text from this link.
Paste the relevant text manually, upload a PDF, or try another source.
```

The app may still accept external clipped Markdown files if users already have them, but external clippers are not the primary product workflow.

## Source Preview

The center pane should preview raw files directly like Obsidian:

- PDF: in-app PDF viewer
- Markdown: rendered read-only
- TXT/transcript: readable plain text
- images: in-app image viewer
- unknown files: metadata plus `Open in default app` / `Reveal in Finder`

PDF preview is required for MVP.

PDF viewer should include at least:

- page navigation
- zoom
- filename/path breadcrumb

## PDF And Visual Extraction

The app should not rely on raw PDF magic.

PDF handling:

1. Extract text when available.
2. Render pages/thumbnails.
3. Automatically detect visually important or low-text pages.
4. Cache extracted helper files under `.studywiki/extracted/`.
5. Provide extracted text and selected page images to AI operations.

Do not ask users to manually select visual pages in the normal flow.

Sources tab may show extraction status:

```text
slides.pdf
Ready
Text extracted
18 visual pages prepared
```

## Visual Assets

Build wiki should automatically create curated visual assets when useful.

Workflow:

```text
raw PDF/image
-> app/Codex identifies useful visuals
-> derived PNGs saved to wiki/assets/<source-slug>/
-> wiki pages embed selected visuals
-> captions cite original raw path + page/slide/figure
```

Rules:

- never modify `raw/`
- do not dump every slide into the wiki
- use visuals only when they improve study
- derived assets belong in `wiki/assets/`
- wiki captions cite original raw sources, not `.studywiki` cache files

Example:

```md
![Three-phase inverter space-vector states](../assets/lecture-03-motor-driver/slide-08-three-phase-inverter-space-vectors.png)
_Figure: three half-bridges create eight useful switch states. Source: `raw/lectures/lecture-03/slides.pdf`, slide 8._
```

## Wiki Reader

Wiki pages are read-only in the app for MVP. The product should not become a full Markdown editor.

Reader requirements:

- render Markdown
- render YAML frontmatter/properties cleanly
- render tags/source references like Obsidian-style properties
- render LaTeX math if present
- render images from `wiki/assets/`
- clickable wikilinks
- broken wikilink indicators
- page history/back-forward navigation

Supported wikilinks:

- `[[page-name]]`
- `[[page-name|label]]`

Resolve links across:

- `wiki/concepts/`
- `wiki/summaries/`
- `wiki/guides/`

Manual editing is out of scope. Provide file actions:

- `Open in default app`
- `Reveal in Finder`
- optional later: `Open in Obsidian`, `Open in VS Code`

## Graph View

Graph view is MVP-required because wikilinks and visual knowledge navigation are core value.

Graph scope:

- wiki pages only for MVP
- nodes: concepts, summaries, guides
- edges: wikilinks
- broken links shown distinctly
- click node to open page
- highlight current page

Views:

- local graph centered on current page as default
- global graph as a tab/view

Raw source nodes are deferred or optional later.

## Connections Panel

In addition to graph view, the reader should include a compact connections/neighborhood panel when feasible.

For the current page, show:

- outgoing links
- backlinks
- related tags

This helps users decide what to read next without needing to interpret the full global graph.

## Changed File Marking

After any AI write operation, the app marks changed files in the tree and shows an operation report.

Changed files are applied directly; there is no accept/discard review step in MVP.

Operation report should show:

- created files
- updated files
- deleted files if any
- warnings/questions
- affected source bundle if relevant
- `Undo last operation`

Markings should persist for the active/latest operation until cleared or replaced by a newer operation.

## Undo And Snapshots

The app uses hidden snapshots, not Git, for MVP undo.

Before each AI write operation, save enough state under `.studywiki/snapshots/` to restore the previous wiki/control-file state.

Undo last operation:

- restores previous versions of changed wiki/control files
- removes files created by the operation
- does not touch `raw/` for wiki operations
- for raw organization operations, restores the prior raw paths when possible

Use hidden snapshots for:

- Build wiki
- Apply to wiki
- Clean up wiki
- raw organization operations

Do not expose Git concepts such as stage, commit, reset, or branch to normal users.

## Permission Validation

The app must enforce mode permissions after AI operations.

MVP approach:

1. Snapshot/manifest before operation.
2. Run AI.
3. Detect file changes.
4. Compare changed paths and hashes to the mode allowlist.
5. Restore or block forbidden changes.
6. Report what happened.

Examples:

- Study modifying `raw/**` is forbidden.
- Wiki Health modifying `raw/**` is forbidden.
- Sources may move/rename raw files, but raw file content hash changes are forbidden unless the user explicitly imports/replaces a source.

If blocked:

```text
The assistant tried to change files outside this mode's permission.
Blocked changes:
- raw/lectures/lecture-02/transcript.md
Restored blocked files.
```

## Export Workspace

If time allows in MVP, add simple export.

Export creates a `.zip` that includes:

```text
raw/
wiki/
index.md
log.md
schema.md
AGENTS.md
```

Exclude:

```text
.studywiki/
.git/
.omx/
.DS_Store
```

The exported zip can be sent to a friend, who can open the unzipped folder as an existing workspace.

## Technical Spike First

Before full UI, build a small operation spike.

Goals:

- create a fresh sample workspace
- detect Codex install/login
- run `codex exec`
- snapshot before operation
- detect changed files
- validate allowed paths
- undo last operation

Test first on a fresh sample workspace. Then test on a copy of `robot-hardware-wiki`, never the real wiki directly.

## Recommended Stack

- Desktop shell: Tauri
- UI: React + TypeScript
- AI execution for spike/MVP: Codex CLI
- Storage: local file workspace
- Markdown rendering: local Markdown parser with wikilink support
- PDF preview/extraction: app-side PDF viewer and extraction/cache pipeline
- Graph: React graph library such as `react-force-graph`, `cytoscape.js`, or similar

## MVP Non-Goals

Do not build in MVP:

- accounts
- payments
- built-in AI billing
- cloud sync
- collaboration
- mobile app
- flashcards
- plugin system
- multi-provider support
- full Markdown editor
- Obsidian replacement scope
- Git-first workflow
- full browser extension/web clipper

## First Demo Acceptance Criteria

- User can create a workspace by answering "What are you studying?"
- User can choose default or custom workspace location.
- User can connect ChatGPT/Codex through guided setup.
- User can add raw sources, including at least PDF and pasted text.
- App detects pending raw changes.
- User can preview raw PDFs in app.
- User can click `Build wiki`.
- Codex creates/updates wiki pages, `index.md`, and `log.md`.
- App marks changed files after the operation.
- User can undo the last operation.
- Wiki reader renders Markdown, properties, images, and wikilinks.
- Graph view works from wikilinks.
- Study chat is read-only by default.
- User can explicitly `Apply to wiki`.
- User can run `Healthcheck wiki`.
- User can run `Clean up wiki` with snapshot and undo.
- App enforces mode permissions and blocks forbidden changes.
