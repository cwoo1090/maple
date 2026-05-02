# Technical Spike

## Main Question

Can the app run Codex in the background using the user's ChatGPT subscription, inside a selected local wiki workspace, then safely detect, validate, mark, and undo changed files?

This must be proven before investing in a full UI.

## Spike Workflow

1. Create a sample workspace.
2. Detect whether Codex is installed.
3. Detect whether Codex is signed in with ChatGPT.
4. Open Terminal-based install/login helpers if needed.
5. Create a hidden pre-operation snapshot.
6. Execute a simple non-interactive `codex exec` task in the workspace.
7. Capture JSON events and stdout/stderr.
8. Detect changed files.
9. Validate changed paths against a mode allowlist.
10. Restore/block forbidden changes.
11. Mark changed files.
12. Undo last operation from the snapshot.

## Example Test Task

```text
Read schema.md. Create a short summary page for raw/sample-note.md under wiki/summaries/.
Update index.md and log.md.
```

Representative command shape:

```bash
codex exec \
  --json \
  --cd <workspace> \
  --skip-git-repo-check \
  --sandbox workspace-write \
  --ask-for-approval never \
  "<operation prompt>"
```

## Risks To Validate

- Codex install/login can be initiated cleanly enough for macOS-first MVP.
- The app can detect whether login succeeded.
- Codex CLI JSON output is stable enough to display progress.
- Codex can be constrained to the selected workspace.
- Filesystem diff is reliable enough to identify changed files.
- Hidden snapshots can undo the last operation.
- Mode allowlists can catch and restore forbidden edits.
- Raw source content can be protected even during source organization.
- A copied real wiki, such as `robot-hardware-wiki`, behaves similarly to the sample workspace.

## Success Criteria

The spike succeeds if the app can:

- run a Codex task
- observe completion or failure
- identify changed files
- validate changes against allowed paths
- restore forbidden changes
- mark changed files
- undo the last operation

For the first spike, guided Terminal install/login is acceptable. The real MVP should minimize terminal exposure, but proving the operation runner is the priority.
