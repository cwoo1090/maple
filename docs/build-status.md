# Build Status

Last updated: 2026-05-02. Stack: Tauri 2 + React 19 + Vite + Node operation-runner + Codex CLI.

## Shipped

### Phase 1 — Operation runner + first shell (pre-rebuild)
Pre-existing before this session. PPTX→PDF auto-conversion via LibreOffice (`soffice`), real completion validation, dependency UI, live progress chat panel, cancel via `cancel-requested.flag`, timeout, stuck-recovery (code in place, **untested**).

### Phase 3 — Product UI rebuild

**B1 — Shell + workspace + file tree**

- **B1a (shell):** 3-pane layout (left tree / center viewer / right activity). Dark theme with purple accent (`#a78bfa`). Topbar (workspace name + status pill + Build/Stop + ⋯ menu), 22px statusbar, empty-state card.
- **B1b (workspace plumbing):**
  - `WorkspaceStore` Tauri managed state holds the current workspace path; every command reads it via `current_workspace(&state)`.
  - Runner subprocess takes workspace as `args[0]` (e.g., `node operation-runner.js build /path/to/workspace`).
  - `set_workspace(path)` mkdirs `raw/`, `wiki/`, `.studywiki/` if missing — any existing folder can be opened.
  - localStorage persists the last-used workspace path; auto-loads on launch.
  - Empty-state buttons wired (Create new / Open existing); both call the same `pickWorkspace` flow with `documentDir()` as default.
  - Top-bar workspace name → `<details>` dropdown with `Switch workspace…`. Switch triggers `window.location.reload()` (full reload, simpler than in-place state swap).
  - `Reset sample workspace` only shown in `⋯` menu when path ends in `/sample-workspace`.
  - Removed dead `check_codex` debug command.
- **B1c (file tree):** Recursive `TreeNode` structure built from `workspace.rawSources` + `workspace.wikiFiles`. Folders sort first, alphabetical within. Click row to toggle expand. Wiki tree includes synthetic `index.md` (top) + `log.md` (bottom). Tooltip on row container shows full path (native, ~500ms delay). Hover-reveal × on raw files for removal.

**B2 — Source flow**

- **3.4 PDF preview:** PDF.js (`pdfjs-dist@4.x`) — pinned to v4 because v5 uses `Map.prototype.getOrInsertComputed` not in current macOS WKWebView. Iframe/embed approach was tried first and abandoned because of WebKit state caching bug (PDF blanks after navigating away and back). Canvas-based viewer renders all pages at 1.5× scale, DPR-aware. CMap files (`public/pdfjs/cmaps/`) and standard fonts (`public/pdfjs/standard_fonts/`) copied from package — required for Korean PDFs to render correctly.
- **3.4 Image preview:** clicking a wiki image (e.g., `wiki/assets/foo.png`) renders inline in center pane via `convertFileSrc` + Tauri asset protocol. `assetProtocol.scope` widened to `$HOME/**` so any workspace under home directory can serve assets.
- **3.3 DnD import:** `getCurrentWebviewWindow().onDragDropEvent` handler. Drag-over shows full-screen overlay with dashed-purple drop zone. Filters supported extensions, calls `import_sources`. Workspace must be open.
- **3.3 Paste-from-clipboard:** **deferred** — low value vs. effort.

**B3 — Reader flow**

- **3.5 Wikilinks:**
  - `[[foo]]` resolves to wiki/raw paths via `resolveWikiLinkTarget` (slug-match against availableDocuments).
  - Resolved → standard purple anchor; click navigates in center pane.
  - Unresolved → red dashed-underline span (`broken-wikilink`) with hover tooltip — uses `studywiki-broken://target` sentinel href that the `<a>` handler intercepts.
  - Workspace-absolute paths (`wiki/foo.md`) and relative paths (`../foo.md`) both resolve via direct match against `availableDocuments` first, then `resolveWorkspacePath` fallback.
  - External URLs (`https://…`) open in default browser via `@tauri-apps/plugin-opener` `openUrl`.
  - **Anchor jumping:** `rehype-slug` auto-generates heading IDs. Anchor part of `[[page#section]]` extracted on click → `pendingAnchor` state → `requestAnimationFrame` → `el.scrollIntoView`. Same-page `#section` anchors work via native browser hash. **AI prompt update pending** — current wiki content has no anchor-style links, so this is dormant until next build prompt edit.

- **3.7 Connections panel:**
  - `LinkGraph` computed once per workspace (`Promise.all` parallel-fetches all wiki `.md`, parses `[[…]]`, inverts for backlinks). Refreshes on file count change or `changedMarker.completedAt` change.
  - Right-pane section, **collapsible**, default collapsed. Lists "Linked from (N)" + "Links from this page (N)". Click any connection → navigates.
  - Hidden when current selection isn't `.md`.

- **3.6 Graph view:**
  - `react-force-graph-2d` + `d3-force` for collide.
  - Toggle in center-pane header (`Page` / `Graph`). Switching to graph fills the center body.
  - Force config: charge `-400`, link distance `100`, collide radius `14`, cooldown 300 ticks. Auto `zoomToFit(500, 60)` on first settle.
  - Node radius scales with degree (`3 + √degree × 1.4`), so hub pages are visibly bigger.
  - Hover highlight: hovered node + neighbors → purple, others dim. Edges to/from hovered node go bright purple, 1.4px width.
  - Click node → switches back to Page view, opens that page.
  - Labels hide when zoomed out (`globalScale < 0.7`).

## Pending

Listed in roughly the order they should ship.

### Phase 6 — Launch polish *(highest visual ROI)*
- macOS title bar: kill the white strip via Tauri `titleBarStyle: "transparent"` + reposition traffic lights.
- App icon (replaces default Tauri "T").
- Long-filename RTL ellipsis option for identical-prefix lecture PDFs.
- Error message + edge case pass (missing `node`, codex CLI errors, etc.).

### Loose ends *(small, fast)*
- **Build-prompt anchor support:** edit `operation-runner.js` to instruct Codex to emit `[[page#section]]` when citing a specific section. Without this, the anchor-jump infrastructure is dormant.
- PPTX clicks → route to converted PDF if one exists.
- **L2:** actually exercise the stuck-recovery flow (code in place, never tested end-to-end).

### Phase 5 — Wiki Health
Tab/panel listing: orphan pages (no inbound links), broken `[[wikilinks]]` workspace-wide, "stale" pages (not updated in N builds), missing summaries. Lower priority — useful once the wiki gets messy.

### Phase 4 — Chat *(deferred — gated on Claude work in separate session)*
AI conversation panel. Reads wiki pages, cites slides, proposes edits. Plugs into Phase 4 once Claude support exists. Current right-pane Activity section is the placeholder where this will live.

## Architecture decisions *(don't re-litigate)*

- **Workspace path = Tauri managed state**, not param-on-every-call. Less boilerplate; `current_workspace(&state)` helper everywhere.
- **Runner CLI takes workspace as `args[0]`** (not `--workspace` flag, not via `cwd`). Matches the runner's existing `resolveWorkspace(args[0])` design.
- **Workspace switch = full window reload** (`window.location.reload()`), not in-place state swap. Eliminates stale-state bugs (timers, polling, chat messages from prior workspace). Reload is fast (~100ms).
- **Workspace persistence = localStorage**, not Tauri config plugin. No new plugin install, simpler for solo dev.
- **PDF rendering = PDF.js, not iframe.** Iframe was unreliable (WebKit state cache bug after navigation). PDF.js also unblocks future features: programmatic page jump for citations, text extraction for AI grounding, custom highlights — all needed for Phase 4+ value. ~30 min one-time setup cost.
- **PDF.js v4, not v5.** v5 uses `Map.prototype.getOrInsertComputed` (Stage-3 proposal) not yet in current WKWebView.
- **Asset protocol scope = `$HOME/**`.** Original scope was hardcoded to sample-workspace path; needed widening so any user workspace renders images.
- **Graph view = `react-force-graph-2d` + `d3-force`.** Tried defaults first (too compressed), bumped repulsion + link distance + added collide for Obsidian-style spread.
- **Connections panel = collapsible, default closed.** User feedback: always-visible panel was redundant.
- **Wikilink resolution = direct `availableDocuments.includes(href)` first, then `resolveWorkspacePath` fallback.** Original code only tried relative resolution, which broke workspace-absolute paths produced by `convertWikiLinks`.
- **Broken wikilinks = inline span via `studywiki-broken://` sentinel href.** Avoids `rehype-raw` + lets us style without inline HTML.
- **Sample-workspace = just another workspace folder**, no special-casing in code paths. Only the `Reset sample workspace` menu item is conditional.

## Known limitations
- Native `title` tooltip has ~500ms OS delay — not customizable. Acceptable for now.
- Tree expansion state resets on workspace switch (because reload). Acceptable.
- `<details>` dropdowns (workspace switcher, ⋯ menu) don't auto-close on outside click. Click summary to close.
- Anchor-style wikilinks not yet produced by AI build — infrastructure ready, content not.
- Macos title bar still light — pending Phase 6.
