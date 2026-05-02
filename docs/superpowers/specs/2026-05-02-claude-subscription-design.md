# Add Claude Subscription Support

Date: 2026-05-02
Status: Approved design — ready for implementation plan

## Goal

Let users run AI Study Wiki Builder operations with their **Claude Pro/Max subscription** (via Claude Code CLI), in addition to the existing **ChatGPT subscription path** (via Codex CLI). No API keys, no built-in billing.

The end state: a Cursor-style settings page where the user picks their AI provider (ChatGPT / Claude) and the specific model. The setting is app-wide and persists across sessions. The runner spawns the right CLI accordingly.

## Current State (as of 2026-05-02)

Two files do all AI work today:

- **`prototype/operation-runner/src/operation-runner.js`** — single ~1,700-line Node script. Contains both workspace orchestration (snapshot, diff, validate, undo) and Codex-specific code (binary name, flags, login check, JSON event handling) mixed together.
- **`prototype/app-shell/src-tauri/src/lib.rs`** — Tauri shell. Spawns the Node script. Has `check_codex`, `install_codex` (via Terminal/osascript), and a `build_wiki` command that calls the runner.

The current Codex invocation:

```
codex exec --json --cd <workspace>
           --skip-git-repo-check
           --sandbox workspace-write
           -c approval_policy="never"
           --output-last-message <path>
           [--image <path> ...]
```

Prompt is piped via stdin. Codex emits JSON events to stdout, runner streams them to `events.jsonl`. After Codex exits, runner diffs against snapshot, restores anything outside the Build Wiki allowlist, writes a report.

The "subscription, no billing" property comes from `codex login` using OpenAI OAuth, not an API key.

## Architecture

### File layout after the change

```
prototype/operation-runner/src/
  operation-runner.js          — orchestration only (snapshot, diff, validate, undo, report)
  providers/
    index.js                   — selectProvider(name) -> provider module
    codex.js                   — all Codex-specific code (extracted from operation-runner.js)
    claude.js                  — new
```

`operation-runner.js` no longer mentions the words `codex` or `claude` directly. It calls into the active provider via the interface below.

### Provider interface

Each provider module exports:

```js
{
  name,                        // "codex" | "claude"
  binary,                      // "codex" | "claude"
  defaultModel,                // string, e.g. "claude-sonnet-4-6"
  supportedModels: [           // for the settings UI dropdown
    { id, label, description, recommended? }
  ],
  installCommand,              // shown in setup UI/errors, e.g. "npm i -g @anthropic-ai/claude-code"
  loginCommand,                // shown in setup UI/errors, e.g. "claude"
  defaultTimeoutMs,            // codex: 15 min, claude: 30 min
  checkInstalled(),            // -> { installed, path, version }
  checkLoggedIn(),             // -> { loggedIn, statusText, warnings? }
  buildExecArgs(ctx),          // -> string[] of CLI flags (no binary, no prompt)
                               //    ctx = { workspace, model, lastMessagePath, imageAttachments,
                               //            permissionMode, eventsPath, maxTurns }
  buildSpawnEnv(baseEnv),      // -> env object for spawn(); allows env scrubbing
  feedPrompt(child, prompt),   // writes prompt to stdin
  finalizeLastMessage(ctx),    // post-run: ensures `lastMessagePath` exists with the final
                               // assistant message. ctx = { eventsPath, lastMessagePath }.
                               // codex: no-op (Codex already wrote the file via --output-last-message)
                               // claude: parses events.jsonl, finds the final `result` event,
                               //         writes its `result` field to `lastMessagePath`
}
```

### Provider selection at runtime

The runner accepts two new flags:

```bash
node src/operation-runner.js build --provider <codex|claude> --model <model-id>
node src/operation-runner.js check --provider <codex|claude>
```

`--provider` defaults to `codex` (zero behavior change for existing callers). If `--model` is omitted, the provider's `defaultModel` is used.

Settings persistence lives in Tauri's `appConfigDir`:

```
~/Library/Application Support/AI Study Wiki Builder/settings.json
```

```json
{
  "provider": "claude",
  "models": {
    "codex":  "gpt-5-codex",
    "claude": "claude-sonnet-4-6"
  }
}
```

Models are remembered **per provider** so toggling providers preserves each side's last choice.

If `settings.json` is missing or fails to parse, Tauri silently writes the defaults:

```json
{
  "provider": "codex",
  "models": {
    "codex":  "gpt-5-codex",
    "claude": "claude-sonnet-4-6"
  }
}
```

The Tauri `build_wiki` command reads settings.json and passes `--provider` and `--model` to the Node runner.

## Settings UI

```
─────────────────────────────────────────
  AI Provider
─────────────────────────────────────────
  ( • )  ChatGPT  (via Codex CLI)
         Model:  [ GPT-5 Codex (Recommended) v ]
         ✓ Installed · ✓ Signed in
         [Sign out]

  (   )  Claude  (via Claude Code CLI)
         Model:  [ Sonnet 4.6 (Recommended)   v ]
         ✗ Not installed
         [Install in Terminal]
─────────────────────────────────────────
```

- Single-select radio between providers.
- Each provider shows install + login status.
- Each provider's model dropdown stays editable even when the provider is not active.
- Action buttons appear conditionally: `Install`, `Sign in`, `Sign out`.
- On first launch with no provider signed in, route the user to Settings before allowing Build Wiki.

## Codex Provider (Refactor Only)

Move the existing logic from `operation-runner.js` into `providers/codex.js`. No functional change.

| Field | Value |
|---|---|
| `binary` | `codex` |
| `defaultModel` | `gpt-5-codex` |
| `supportedModels` | `gpt-5-codex` (Recommended), `gpt-5`, `gpt-5-mini` (TBD-verify against `codex --help`) |
| `installCommand` | `npm i -g @openai/codex` |
| `loginCommand` | `codex login` |
| `checkInstalled` | `command -v codex` (with PATH fallback — see Edge Cases) + `codex --version` |
| `checkLoggedIn` | `codex login status`, match `/logged in/i` |
| `buildExecArgs` | `["exec", "--json", "--cd", workspace, "--skip-git-repo-check", "--sandbox", "workspace-write", "-c", 'approval_policy="never"', "--output-last-message", lastMessagePath, "-m", model, ...imageFlags]` |
| `feedPrompt` | write prompt to stdin |
| `finalizeLastMessage` | no-op (Codex already wrote the file via `--output-last-message`) |
| `defaultTimeoutMs` | 15 min |

The exact `supportedModels` list should be verified against `codex --help` and the user's ChatGPT subscription tier before shipping. Easy to adjust.

## Claude Provider (New)

| Field | Value |
|---|---|
| `binary` | `claude` |
| `defaultModel` | `claude-sonnet-4-6` |
| `supportedModels` | `claude-sonnet-4-6` (Recommended), `claude-opus-4-7` (Heavy rate limits on Claude Pro; Max recommended), `claude-haiku-4-5-20251001` (fast/cheap) |
| `installCommand` | `npm i -g @anthropic-ai/claude-code` |
| `loginCommand` | `claude` (interactive — first run launches OAuth in browser via Pro/Max account) |
| `checkInstalled` | `command -v claude` (with PATH fallback) + `claude --version` |
| `checkLoggedIn` | stat `~/.claude/.credentials.json` (file exists + non-empty). Heuristic. Actual auth validity is verified at runtime. Surface warning if `ANTHROPIC_API_KEY` env var is set. |
| `buildExecArgs` | `["-p", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "--add-dir", workspace, "--model", model, "--max-turns", String(maxTurns)]` |
| `cwd` | workspace path (replaces Codex's `--cd`) |
| `buildSpawnEnv` | strip `ANTHROPIC_API_KEY` from inherited env (forces subscription auth, prevents accidental API billing) |
| `feedPrompt` | write prompt to stdin |
| `finalizeLastMessage` | parse `events.jsonl`, find final `{type:"result"}` event, write its `result` field to `lastMessagePath`. Handle `subtype` of `success`, `error_max_turns`, `error_during_execution`. |
| `defaultTimeoutMs` | 30 min |

### Three real differences from Codex

#### 1. Sandbox model is weaker

Codex's `--sandbox workspace-write` is OS-level — physically prevents writes outside the workspace. Claude Code's `--dangerously-skip-permissions` only removes the per-tool-call permission prompts; it does not add OS-level walls.

**Mitigation:** the existing snapshot + diff + restore-forbidden flow is provider-agnostic. The runner does not trust the AI; it verifies what changed and reverts anything outside `BUILD_WIKI_ALLOWED_PATHS`. Claude losing the OS sandbox is acceptable because that wall was not the load-bearing protection.

Risk worth being honest about: anything Claude writes to a destructive location *during* the run, before validation runs, is a real (but very narrow) window. With the prompt scoped to the workspace and `--add-dir <ws>`, occurrence is unlikely but non-zero.

#### 2. No `--output-last-message` flag

Claude Code does not have an equivalent of Codex's `--output-last-message`. Workaround: Claude's `stream-json` events end with a `result` event:

```jsonl
{"type":"result","subtype":"success", "result":"..."}
```

`claude.js#extractLastMessage` reads `events.jsonl`, finds the final `result` event, writes its `result` field to the same `lastMessagePath` Codex would have used. The rest of the runner reads `last-message.md` unchanged.

Result-event subtypes map to runner statuses:

| Subtype | Runner status |
|---|---|
| `success` | `completed` (then post-hoc validation runs) |
| `error_max_turns` | new: `turn_budget_exceeded` |
| `error_during_execution` | `provider_failed` (rename of today's `codex_failed`) |

#### 3. Image handling: comparable quality, different mechanics

Codex with `--image <path>` attaches images directly into the conversation at turn 1. Claude Code has no CLI flag for this; instead, image paths are listed in the prompt body and Claude's `Read` tool opens them on demand.

For typical sources (≤25 page images), quality is on par with or better than Codex — Sonnet/Opus vision is excellent. The two narrow concerns for very large sources (50+ images):

- **Turn budget.** Each image Read is a turn. 50 images is 50 turns before any synthesis. Mitigation: pass `--max-turns (image_count + 20)`.
- **Selective skipping.** Claude may decide to skim rather than read all images. Mitigation: prompt instruction explicitly requires reading every prepared image, e.g., *"Read every image listed under Prepared source artifacts before writing any wiki page."*

The current Build Wiki prompt already lists prepared images by path (`renderPreparedSourcesForPrompt` in `operation-runner.js`); add the explicit-read instruction.

## Tauri Shell Changes

New / changed commands in `prototype/app-shell/src-tauri/src/lib.rs`:

| Command | Purpose |
|---|---|
| `get_settings()` | Read settings.json. Reset to defaults silently if missing or corrupt. |
| `set_provider(name)` | Update `provider` in settings.json. |
| `set_model(provider, modelId)` | Update `models[provider]` in settings.json. |
| `list_providers()` | Returns providers + their `supportedModels` for React to render dropdowns. |
| `check_provider(name)` | Install + login status for one provider (replaces today's `check_codex`). |
| `install_provider(name)` | Open Terminal with that provider's install command. |
| `login_provider(name)` | Open Terminal with that provider's login command. |
| `build_wiki()` | Reads settings.json itself, passes `--provider` and `--model` to runner. |

Provider-neutral commands (`status`, `undo`, `cancel`, `check_soffice`, `install_libreoffice`) do not change.

## What Stays Unchanged

- Snapshot / diff / restore-forbidden / report flow.
- `BUILD_WIKI_ALLOWED_PATHS` allowlist.
- `.studywiki/` directory layout (snapshots, operations, changed, running).
- The Build Wiki prompt itself, with one addition: an explicit "read every prepared image" instruction.
- Operation report schema gains two fields: `report.provider` and `report.model`. Both useful for debugging operation reports weeks later.
- Undo (provider-agnostic by design).

## Edge Cases & Risks

### Critical (handled in this design)

- **Permission mode for headless runs.** `--dangerously-skip-permissions` is required, not `acceptEdits`. The latter only auto-approves Edit/Write; Bash tool calls would otherwise hang in non-interactive mode.
- **`ANTHROPIC_API_KEY` env var override.** Claude Code prefers an env API key over OAuth subscription auth. If the user has one set, the app would silently bill their API key, breaking the "no billing on user" promise. Mitigation: `claude.js#buildSpawnEnv` strips `ANTHROPIC_API_KEY` from the spawned child's env.

### Important

- **macOS GUI-app PATH problem.** Tauri-bundled apps may not inherit shell PATH. `command -v` already runs through `sh -lc` (login shell), but on LaunchServices-launched macOS apps, even login shells sometimes have stripped PATH. Both providers' `checkInstalled` should fall back to checking `/usr/local/bin`, `/opt/homebrew/bin`, and `~/.nvm/versions/node/*/bin` if `command -v` returns nothing.
- **Login-state heuristic.** Filesystem stat is not bulletproof — credentials file may exist but tokens may be expired. Acceptable for MVP. Surface runtime auth failures clearly in the operation report (*"Claude returned an authentication error. Sign in again from Settings."*).
- **Operation timeout.** Each provider declares its own `defaultTimeoutMs` (Codex 15 min, Claude 30 min). The runner uses the active provider's default when `--timeout-ms` is not passed. Image-via-Read on Claude adds turns, which is why Claude's default is higher.
- **Subscription-tier mismatch mid-run.** User on Claude Pro picks Opus, hits a rate limit mid-build. Surface stderr text in the report so the user understands *why* it failed.
- **Telemetry.** Claude Code may send usage telemetry by default. For a study app with sensitive notes, consider setting `DISABLE_TELEMETRY=1` (or current equivalent — verify at implementation time) when spawning. Document this; ask the user for their preference if it matters.

### Edge cases (be aware, no design change)

- Settings UI should re-check provider status on window focus (user may install/uninstall in Terminal while the app is open).
- Provider/model dropdowns should be disabled while a build is running (`is_building` state).
- Snapshot + restore must handle file *deletions*, not just modifications. Verify existing diff/restore code covers this.
- Multi-Claude-account users: show generic "Signed in"; cannot reliably show account name.
- Cancel via SIGTERM: today the runner sends SIGTERM to the Codex child. Verify Claude Code child responds to SIGTERM cleanly.
- Settings file corruption: parse errors → reset to defaults silently.

## Rollout Order

1. **Refactor** `operation-runner.js` — extract Codex-specific code into `providers/codex.js`. No behavior change. Verify `npm run build` still works on the sample workspace.
2. **Plumb `--provider` and `--model` flags** through the runner CLI. Default `--provider codex` so existing callers work unchanged.
3. **Write `providers/claude.js`** — install check first, login check second, then exec args. Include `--dangerously-skip-permissions`, `ANTHROPIC_API_KEY` strip, and PATH fallbacks.
4. **Manual verification** on the sample workspace:
   - `node src/operation-runner.js check --provider claude` reports correct install + login state.
   - `node src/operation-runner.js build --provider claude` produces wiki content end-to-end.
   - Side-by-side with `slides.pdf` source: confirm Claude reads images and produces comparable Build Wiki output.
5. **Add Tauri commands** for settings (`get_settings`, `set_provider`, `set_model`, `list_providers`) and provider-neutral install/login (`check_provider`, `install_provider`, `login_provider`). Update `build_wiki` to read settings and pass flags through.
6. **React Settings page** — provider radio + per-provider model dropdown + status + action buttons.
7. **Polish** — bump default timeout to 30 min for Claude; map `result` subtypes to runner statuses; rename `codex_failed` → `provider_failed`; add `provider`/`model` fields to operation reports.

## Open TBDs (verify at implementation time)

- Exact accepted values for Codex's `-m` flag (`gpt-5-codex` and friends). Run `codex --help` and prune the list to what's actually accepted on the user's tier.
- Exact location of Claude credentials file on macOS — confirm `~/.claude/.credentials.json` matches current Claude Code behavior; adjust if filename differs.
- Claude Code telemetry env var name — confirm before shipping.
- Whether Claude Code's `--max-turns` flag accepts the values we plan to use (large numbers for image-heavy sources).

## Non-Goals

- Per-workspace provider override (workspace-level setting) — out of scope; single app-wide setting is enough for now.
- Per-operation provider picker — same.
- Anthropic API key path as an explicit choice. The app actively prevents it (env var stripping). If a user really wants to use an API key, they can set the env var before launching the app and unstrip it; not a documented path.
- Multi-provider fallback (e.g., "if Claude fails, retry on Codex"). Adds complexity without clear value.
- Streaming progress events to the React UI in real time. Today the runner just persists `events.jsonl`; this design keeps that. Live progress is a separate, larger spec.
