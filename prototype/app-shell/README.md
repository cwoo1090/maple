# App Shell Prototype

This is the thin desktop integration spike for AI Study Wiki Builder.

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
- polished study reader
