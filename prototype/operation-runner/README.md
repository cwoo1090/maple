# Operation Runner Prototype

This spike proves the local operation model before building the Tauri/React UI.

It can:

- create a sample study wiki workspace
- check Codex CLI install/login
- snapshot before an AI write operation
- run one `codex exec` Build Wiki operation
- detect changed files without Git
- validate changed paths against the Build Wiki allowlist
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
prototype/operation-runner/sample-workspace/.studywiki/
```

## Commands

```bash
node src/operation-runner.js create-sample
node src/operation-runner.js check-codex
node src/operation-runner.js build
node src/operation-runner.js status
node src/operation-runner.js undo
node src/operation-runner.js create-sample --force
```

Pass a workspace path as the first positional argument to target another compatible workspace:

```bash
node src/operation-runner.js build /path/to/workspace
```

Use `--instruction "..."` to add one-off build guidance, or `--dry-run` to test snapshot/report plumbing without starting Codex.

## Build Wiki Allowlist

The Build Wiki operation may write:

```text
wiki/**
index.md
log.md
schema.md
.studywiki/**
```

It must not modify `raw/**`. If Codex changes a forbidden path, the runner restores that path from the pre-operation snapshot and records it as blocked in the operation report.
