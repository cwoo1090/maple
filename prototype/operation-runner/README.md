# Operation Runner Prototype

This spike proves the local operation model before building the Tauri/React UI.

It can:

- create a sample Maple wiki workspace
- check Codex CLI install/login
- snapshot before an AI write operation
- run one `codex exec` Build Wiki operation
- run Maintain operations for wiki healthchecks, wiki organization, source organization, and wiki rules
- track pending source changes with `.aiwiki/source-manifest.json`
- detect changed files without Git
- validate changed paths against per-operation allowlists
- mark/report changed files
- undo the last operation

## Quick Start

```bash
cd prototype/operation-runner
npm run init
npm run check
npm run build
npm run status
npm run undo
```

The sample workspace is created at:

```text
prototype/operation-runner/sample-workspace/
```

Local runner metadata is stored under:

```text
prototype/operation-runner/sample-workspace/.aiwiki/
```

## Commands

```bash
node src/operation-runner.js create-sample
node src/operation-runner.js check-codex
node src/operation-runner.js build --instruction "Focus on exam review"
node src/operation-runner.js wiki-healthcheck
node src/operation-runner.js improve-wiki --instruction "Make guides beginner to advanced"
node src/operation-runner.js organize-sources --instruction "Group sources by lecture week"
node src/operation-runner.js update-rules --instruction "Add practice questions to every guide"
node src/operation-runner.js status
node src/operation-runner.js undo
node src/operation-runner.js create-sample --force
```

Pass a workspace path as the first positional argument to target another compatible workspace:

```bash
node src/operation-runner.js build /path/to/workspace
```

Use `--instruction "..."` to add one-off operation guidance, or `--dry-run` with `build` to test snapshot/report plumbing without starting Codex. Use `--force` with `build` to rebuild all current sources instead of only pending source changes.

## Build Wiki Allowlist

The Build Wiki operation may write:

```text
sources/**
wiki/**
index.md
log.md
schema.md
.aiwiki/**
```

It may move or rename files under `sources/**`, but it must not edit source file contents. If Codex changes source file bytes or any forbidden path, the runner restores that path from the pre-operation snapshot and records it as blocked in the operation report.
