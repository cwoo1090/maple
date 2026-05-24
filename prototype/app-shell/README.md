# App Shell Prototype

This is the thin desktop integration spike for Maple.

It does not implement the full app UI. It proves that a Tauri/React shell can call
the operation runner and display:

- Codex setup status
- sample workspace state
- Build wiki progress/output
- changed files
- generated `index.md` and `log.md`
- latest operation report
- undo state

## Commands

```bash
npm install
npm run build
npm run tauri build
npm run tauri dev
```

## Analytics

PostHog is disabled by default on `localhost:1420` so local Tauri dev sessions
are not collected or recorded. To exclude specific PostHog distinct IDs in
other environments, set:

```bash
VITE_POSTHOG_EXCLUDED_DISTINCT_IDS=uuid-1,uuid-2
```

The AI connection funnel is intentionally granular for Codex/ChatGPT and Claude
setup:

- `ai connection runtime check started|completed|failed`
- `ai connection check started|completed|failed`
- `ai connection action started|blocked|launched|failed`
- `ai connection poll started|attempt|completed|timed out|failed`
- `ai connection helper save started|saved|failed`
- `ai setup provider selected|selection saved|selection failed`

These events use booleans and counts for local state, such as Node/npm readiness,
provider installed/logged-in status, candidate counts, warning counts, and
whether a saved path exists. They do not send local binary paths.

## Setup UX Simulation

Use these dev-only environment flags to test first-run setup states without
uninstalling local tools:

```bash
MAPLE_SIMULATE_MISSING_NODE=1 npm run tauri dev
MAPLE_SIMULATE_MISSING_NPM=1 npm run tauri dev
MAPLE_SIMULATE_MISSING_CODEX=1 npm run tauri dev
MAPLE_SIMULATE_CODEX_LOGGED_OUT=1 npm run tauri dev
MAPLE_SIMULATE_MISSING_CLAUDE=1 npm run tauri dev
MAPLE_SIMULATE_CLAUDE_LOGGED_OUT=1 npm run tauri dev
```

The flags affect the app's setup checks only. They do not remove or modify
your installed Node.js, npm, Codex, or Claude Code.

The app backend calls:

```text
../operation-runner/src/operation-runner.js
```

The sample workspace remains owned by the operation runner:

```text
../operation-runner/sample-workspace/
```

## Current Scope

Implemented:

- `Check Codex`
- `Reset sample`
- `Build wiki`
- `Undo`
- changed-file panel
- wiki file list
- `index.md` / `log.md` preview
- runner output and latest report preview

Deferred:

- real workspace picker
- source import
- PDF preview
- wikilink navigation
- graph view
- polished wiki reader
