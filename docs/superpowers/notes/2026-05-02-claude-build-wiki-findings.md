# Claude Subscription — Build & Verification Notes (2026-05-02)

Tasks 0–13 from `docs/superpowers/plans/2026-05-02-claude-subscription.md` are complete.
This doc captures what was verified mechanically vs. what still needs hands-on user testing.

## What runs end-to-end without user action

- `cd prototype/operation-runner && node --test` — 13/13 pass
- `cd prototype/app-shell && npx tsc -b --noEmit` — clean
- `cd prototype/app-shell/src-tauri && cargo check` — clean
- `node src/operation-runner.js check --provider codex` — returns full JSON, including subscription auth
- `node src/operation-runner.js check --provider claude` — returns full JSON; reports install path, version, login state
- ANTHROPIC_API_KEY warning surfaces correctly when the env var is set

## What requires hands-on user verification

These need a running Tauri app and live AI providers, so we couldn't automate them:

1. **Settings page renders.** Open the app → ⋯ menu → Settings… → both providers visible with model dropdowns, status pills, and Recheck/Install/Sign-in buttons.
2. **Persistence.** Switch provider → close Settings → reopen → choice survived. Switch model → reopen → survived. Backing file lives at `appConfigDir/settings.json`.
3. **Codex Build wiki.** Set provider=codex / model=gpt-5.5 → Build wiki → report.json includes `"provider": "codex"` and `"model": "gpt-5.5"`.
4. **Claude Build wiki.** Set provider=claude / model=claude-sonnet-4-6 → Build wiki → report.json includes `"provider": "claude"` and `"model": "claude-sonnet-4-6"`. Also confirm `events.jsonl` ends in `result` event with `subtype: "success"`.
5. **Codex vs Claude image quality.** Same workspace, two consecutive Build wiki runs (with Undo between), compare wiki output qualitatively for image-derived figures and references.
6. **Install/Sign-in flows.** With a provider not installed or not signed in, Install in Terminal / Sign in in Terminal should open Terminal.app with the right command.

## Known nuances worth flagging

### Login detection on this Mac

`security find-generic-password -s 'Claude Code-credentials'` returns exit 44 ("not found") on this machine right now, AND `~/.claude/.credentials.json` does not exist. The runner correctly reports `loggedIn: false`. This is **not** a bug — Claude Code is simply not signed in via the OAuth/login flow.

If a future Claude Code release moves credential storage somewhere else, this two-pronged check (file then keychain) will start producing false negatives. If we see that, expand `checkLoggedIn` in `prototype/operation-runner/src/providers/claude.js` to probe additional locations.

### ANTHROPIC_API_KEY in shell

If the user has `ANTHROPIC_API_KEY` exported in their shell, `check --provider claude` surfaces a warning. The runner keeps the env var in the spawned process env, so Claude Code may use API-key billing instead of subscription billing until the user unsets it.

### `--provider` and `--model` plumbing in Tauri

`build_wiki` reads `settings.json` per call (no caching), so changing provider/model in the Settings page takes effect on the very next Build wiki click. No app restart needed.

### Sandbox

Codex uses `--sandbox workspace-write`. Claude uses `--dangerously-skip-permissions`. The real safety net for both is the runner's snapshot + diff + restore-forbidden pass — provider-agnostic. If a model writes outside `wiki/` / `index.md` / `log.md`, the change gets reverted before commit and the report status becomes `completed_with_forbidden_edits_restored`.

## Next steps if anything breaks during manual testing

- Build fails with `provider_failed`: check `report.codex.exitCode` and `events.jsonl` for the actual provider error.
- Build hits `turn_budget_exceeded` on Claude: increase the floor in `runBuildWiki` (currently `Math.max(25, imageCount + 20)`).
- Settings page won't load providers: open devtools, look for failures on `list_providers` invoke.
- Settings won't persist: check `appConfigDir/settings.json` permissions and inspect whatever the OS reports for Tauri's app config dir.
