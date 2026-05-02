# Claude Subscription Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users run Build Wiki with their Claude Pro/Max subscription via Claude Code CLI, in addition to today's Codex CLI path. Add a Cursor-style Settings page with provider + model pickers.

**Architecture:** Refactor the Codex-specific code out of `operation-runner.js` into a `providers/codex.js` adapter, then add a parallel `providers/claude.js`. The runner orchestration (snapshot, diff, validate, undo) becomes provider-agnostic and calls into the active provider via a small interface. A `--provider`/`--model` flag pair plumbs through the Node CLI; Tauri commands read app settings and pass the flags through. React Settings page exposes provider + model selection.

**Tech Stack:** Node 20 (CommonJS), Node `node --test`, Tauri 2 (Rust), React 19 + TypeScript, Vite. Existing repo is not yet a git repo — Task 0 initializes it.

**Spec:** `docs/superpowers/specs/2026-05-02-claude-subscription-design.md`

---

## File Structure

**New files:**
- `prototype/operation-runner/src/providers/index.js` — `selectProvider(name)`
- `prototype/operation-runner/src/providers/codex.js` — Codex adapter (extracted)
- `prototype/operation-runner/src/providers/claude.js` — Claude adapter (new)
- `prototype/operation-runner/test/providers/contract.test.js` — interface contract test
- `prototype/operation-runner/test/providers/claude.finalize.test.js` — stream-json result parsing
- `prototype/app-shell/src/Settings.tsx` — React Settings page
- `prototype/app-shell/src/settings.ts` — TypeScript types/helpers shared with App

**Modified:**
- `prototype/operation-runner/src/operation-runner.js` — orchestration only, calls providers via interface
- `prototype/app-shell/src-tauri/src/lib.rs` — adds settings IO + per-provider commands
- `prototype/app-shell/src/App.tsx` — adds Settings button/route, passes through to existing flow

---

## Task 0: Initialize git and baseline commit

**Files:** repo root, `.gitignore`

- [ ] **Step 1:** Confirm not yet a git repo

```bash
cd /Users/ahnchulwoo/ai-study-wiki-builder
git status
```

Expected: `fatal: not a git repository`.

- [ ] **Step 2:** Initialize, set main as default

```bash
git init -b main
```

- [ ] **Step 3:** Verify `.gitignore` covers prototype build artifacts

Read `.gitignore`. Confirm it includes `node_modules`, `dist`, `target`, `.studywiki`, `*.DS_Store`. If any are missing, append them.

- [ ] **Step 4:** Baseline commit

```bash
git add -A
git commit -m "chore: baseline before Claude subscription support"
```

---

## Task 1: Provider interface contract test (failing)

**Files:**
- Create: `prototype/operation-runner/test/providers/contract.test.js`

- [ ] **Step 1:** Write the failing contract test

```js
// prototype/operation-runner/test/providers/contract.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const codex = require("../../src/providers/codex");
const claude = require("../../src/providers/claude");

const REQUIRED_FIELDS = [
  "name",
  "binary",
  "defaultModel",
  "supportedModels",
  "installCommand",
  "loginCommand",
  "defaultTimeoutMs",
];

const REQUIRED_METHODS = [
  "checkInstalled",
  "checkLoggedIn",
  "buildExecArgs",
  "buildSpawnEnv",
  "feedPrompt",
  "finalizeLastMessage",
];

for (const provider of [codex, claude]) {
  test(`${provider.name} declares required fields`, () => {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(
        provider[field] !== undefined,
        `${provider.name} missing field: ${field}`,
      );
    }
    assert.ok(Array.isArray(provider.supportedModels));
    assert.ok(provider.supportedModels.length > 0);
    assert.equal(typeof provider.defaultTimeoutMs, "number");
  });

  test(`${provider.name} declares required methods`, () => {
    for (const method of REQUIRED_METHODS) {
      assert.equal(
        typeof provider[method],
        "function",
        `${provider.name} missing method: ${method}`,
      );
    }
  });
}
```

- [ ] **Step 2:** Run it and verify failure

```bash
cd prototype/operation-runner
node --test test/providers/contract.test.js
```

Expected: FAIL with `Cannot find module '../../src/providers/codex'`.

- [ ] **Step 3:** Commit the failing test

```bash
git add prototype/operation-runner/test/providers/contract.test.js
git commit -m "test: add provider interface contract test"
```

---

## Task 2: Extract Codex into `providers/codex.js`

**Files:**
- Create: `prototype/operation-runner/src/providers/codex.js`
- Create: `prototype/operation-runner/src/providers/index.js`
- Modify: `prototype/operation-runner/src/operation-runner.js` (remove Codex specifics; call provider)

- [ ] **Step 1:** Create the provider selector

```js
// prototype/operation-runner/src/providers/index.js
const codex = require("./codex");
const claude = require("./claude");

const REGISTRY = { codex, claude };

function selectProvider(name) {
  const provider = REGISTRY[name];
  if (!provider) {
    const known = Object.keys(REGISTRY).join(", ");
    throw new Error(`Unknown provider "${name}". Known: ${known}`);
  }
  return provider;
}

module.exports = { selectProvider, listProviders: () => Object.values(REGISTRY) };
```

- [ ] **Step 2:** Create `codex.js` with the moved logic

```js
// prototype/operation-runner/src/providers/codex.js
const { spawnSync } = require("node:child_process");

function cleanCommandText(text) {
  return (text || "").trim() || null;
}

function checkInstalled() {
  const pathCommand =
    process.platform === "win32"
      ? spawnSync("where", ["codex"], { encoding: "utf8" })
      : spawnSync("sh", ["-lc", "command -v codex"], { encoding: "utf8" });

  const installed = pathCommand.status === 0 && pathCommand.stdout.trim().length > 0;
  if (!installed) return { installed: false, path: null, version: null };

  const version = spawnSync("codex", ["--version"], { encoding: "utf8" });
  return {
    installed: true,
    path: pathCommand.stdout.trim().split(/\r?\n/)[0],
    version: cleanCommandText(version.stdout || version.stderr),
  };
}

function checkLoggedIn() {
  const login = spawnSync("codex", ["login", "status"], { encoding: "utf8" });
  const statusText = cleanCommandText(login.stdout || login.stderr);
  return {
    loggedIn: login.status === 0 && /logged in/i.test(statusText || ""),
    statusText,
    warnings: [],
  };
}

function buildExecArgs(ctx) {
  const args = [
    "exec",
    "--json",
    "--cd", ctx.workspace,
    "--skip-git-repo-check",
    "--sandbox", "workspace-write",
    "-c", 'approval_policy="never"',
    "--output-last-message", ctx.lastMessagePath,
    "-m", ctx.model,
  ];
  for (const imagePath of ctx.imageAttachments || []) {
    args.push("--image", imagePath);
  }
  return args;
}

function buildSpawnEnv(baseEnv) {
  return { ...baseEnv };
}

function feedPrompt(child, prompt) {
  child.stdin.end(prompt);
}

async function finalizeLastMessage() {
  // Codex already wrote the file via --output-last-message.
  return { subtype: null };
}

module.exports = {
  name: "codex",
  binary: "codex",
  defaultModel: "gpt-5-codex",
  supportedModels: [
    { id: "gpt-5-codex", label: "GPT-5 Codex", recommended: true },
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 Mini" },
  ],
  installCommand: "npm i -g @openai/codex",
  loginCommand: "codex login",
  defaultTimeoutMs: 15 * 60 * 1000,
  checkInstalled,
  checkLoggedIn,
  buildExecArgs,
  buildSpawnEnv,
  feedPrompt,
  finalizeLastMessage,
};
```

- [ ] **Step 3:** Create a stub `claude.js` so the contract test loads (real implementation in Task 7)

```js
// prototype/operation-runner/src/providers/claude.js
const NOT_IMPLEMENTED = () => {
  throw new Error("Claude provider is stubbed; implement in Task 7+");
};

module.exports = {
  name: "claude",
  binary: "claude",
  defaultModel: "claude-sonnet-4-6",
  supportedModels: [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", recommended: true },
  ],
  installCommand: "npm i -g @anthropic-ai/claude-code",
  loginCommand: "claude",
  defaultTimeoutMs: 30 * 60 * 1000,
  checkInstalled: () => ({ installed: false, path: null, version: null }),
  checkLoggedIn: () => ({ loggedIn: false, statusText: "stub", warnings: [] }),
  buildExecArgs: NOT_IMPLEMENTED,
  buildSpawnEnv: (env) => ({ ...env }),
  feedPrompt: NOT_IMPLEMENTED,
  finalizeLastMessage: NOT_IMPLEMENTED,
};
```

- [ ] **Step 4:** Verify the contract test passes

```bash
cd prototype/operation-runner
node --test test/providers/contract.test.js
```

Expected: PASS, both providers satisfy the interface.

- [ ] **Step 5:** Commit

```bash
git add prototype/operation-runner/src/providers
git commit -m "feat: add provider interface with codex adapter and claude stub"
```

---

## Task 3: Wire `--provider` flag through the runner

**Files:**
- Modify: `prototype/operation-runner/src/operation-runner.js`

- [ ] **Step 1:** Import the selector at the top of the file

Replace the hardcoded `checkCodex` body in `operation-runner.js` (around lines 325–352) with a thin pass-through, and import the providers:

```js
// near the top of operation-runner.js, with other requires:
const { selectProvider } = require("./providers");
```

- [ ] **Step 2:** Replace `checkCodex()` calls with `selectProvider(provider).checkInstalled()` etc.

In `runBuildWiki()` (around line 372), change:

```js
const codex = checkCodex();
if (!codex.installed) {
  throw new Error("Codex CLI is not installed. Run: npm i -g @openai/codex");
}
if (!codex.loggedIn) {
  throw new Error("Codex login was not confirmed. Run: codex login");
}
```

to:

```js
const provider = selectProvider(options.provider || "codex");
const installed = provider.checkInstalled();
if (!installed.installed) {
  throw new Error(`${provider.name} CLI is not installed. Run: ${provider.installCommand}`);
}
const auth = provider.checkLoggedIn();
if (!auth.loggedIn) {
  throw new Error(`${provider.name} login was not confirmed. Run: ${provider.loginCommand}`);
}
```

- [ ] **Step 3:** Update `runBuildWiki()` arg construction to call `provider.buildExecArgs(...)` instead of the hardcoded array around lines 412–427:

```js
const args = provider.buildExecArgs({
  workspace,
  model: options.model || provider.defaultModel,
  lastMessagePath,
  imageAttachments: preparedSources.imageAttachments,
});
```

- [ ] **Step 4:** Update `runCodexExec` to use the provider

Rename `runCodexExec` to `runProviderExec`. Replace `spawn("codex", args, ...)` with `spawn(provider.binary, args, ...)`. Use `provider.buildSpawnEnv(process.env)` for the spawn env, and `provider.feedPrompt(child, prompt)` instead of `child.stdin.end(prompt)`. Update the call site in `runBuildWiki` to pass `provider`.

- [ ] **Step 5:** Add `--provider` and `--model` parsing in `runBuildWiki` invocation in `main()` (around line 53):

```js
case "build":
case "build-wiki":
  await runBuildWiki(resolveWorkspace(args[0]), {
    provider: flags.provider || "codex",
    model: flags.model || "",
    extraInstruction: flags.instruction || "",
    promptFile: flags["prompt-file"] || "",
    dryRun: Boolean(flags["dry-run"]),
    strictValidation: Boolean(flags["strict-validation"]),
    timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
  });
  break;
```

Note: `timeoutMs` default changes from `DEFAULT_CODEX_TIMEOUT_MS` to `0`; the runner falls back to `provider.defaultTimeoutMs` when `0`.

- [ ] **Step 6:** Use the provider's default timeout in `runProviderExec` when none is passed

```js
const timeoutMs = paths.timeoutMs && paths.timeoutMs > 0
  ? paths.timeoutMs
  : provider.defaultTimeoutMs;
```

- [ ] **Step 7:** Update `printHelp()` to mention `--provider` and `--model`

- [ ] **Step 8:** Run existing tests

```bash
cd prototype/operation-runner
node --test
```

Expected: PASS (path-validation test + contract test).

- [ ] **Step 9:** Manual smoke test — Codex still works with default

```bash
node src/operation-runner.js check-codex
```

Expected: same output as before (Codex install/login JSON).

- [ ] **Step 10:** Commit

```bash
git add prototype/operation-runner/src
git commit -m "refactor: route runner through provider interface, default codex"
```

---

## Task 4: Generic `check` command across providers

**Files:**
- Modify: `prototype/operation-runner/src/operation-runner.js`

- [ ] **Step 1:** Add a generic `check` command

In `main()`'s switch, add:

```js
case "check": {
  const providerName = flags.provider || "codex";
  const provider = selectProvider(providerName);
  const installed = provider.checkInstalled();
  const auth = installed.installed ? provider.checkLoggedIn() : { loggedIn: false, statusText: null, warnings: [] };
  console.log(JSON.stringify({
    provider: provider.name,
    installed,
    auth,
    installCommand: provider.installCommand,
    loginCommand: provider.loginCommand,
  }, null, 2));
  break;
}
```

Keep `check-codex` as an alias that calls `check --provider codex` for backwards compat.

- [ ] **Step 2:** Manual test

```bash
node src/operation-runner.js check --provider codex
node src/operation-runner.js check-codex
```

Expected: same JSON shape; second is an alias.

- [ ] **Step 3:** Commit

```bash
git add prototype/operation-runner/src/operation-runner.js
git commit -m "feat: add generic 'check --provider' command"
```

---

## Task 5: Claude provider — install/login

**Files:**
- Modify: `prototype/operation-runner/src/providers/claude.js`

- [ ] **Step 1:** Add a PATH-fallback binary lookup helper

Replace the stub `checkInstalled` with the real implementation. Include the macOS PATH fallback noted in the spec.

```js
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const COMMON_BIN_DIRS = ["/usr/local/bin", "/opt/homebrew/bin"];

function findBinary(name) {
  const probe =
    process.platform === "win32"
      ? spawnSync("where", [name], { encoding: "utf8" })
      : spawnSync("sh", ["-lc", `command -v ${name}`], { encoding: "utf8" });

  if (probe.status === 0 && probe.stdout.trim()) {
    return probe.stdout.trim().split(/\r?\n/)[0];
  }

  const candidates = [...COMMON_BIN_DIRS];
  const nvmDir = path.join(os.homedir(), ".nvm/versions/node");
  if (fs.existsSync(nvmDir)) {
    for (const v of fs.readdirSync(nvmDir)) {
      candidates.push(path.join(nvmDir, v, "bin"));
    }
  }
  for (const dir of candidates) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function checkInstalled() {
  const binPath = findBinary("claude");
  if (!binPath) return { installed: false, path: null, version: null };
  const v = spawnSync(binPath, ["--version"], { encoding: "utf8" });
  return {
    installed: true,
    path: binPath,
    version: ((v.stdout || v.stderr) || "").trim() || null,
  };
}

function checkLoggedIn() {
  const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
  const warnings = [];
  if (process.env.ANTHROPIC_API_KEY) {
    warnings.push(
      "ANTHROPIC_API_KEY is set in your shell. The app strips it before launching Claude so your subscription is used. Unset it if you want subscription auth in your own terminal too.",
    );
  }
  let loggedIn = false;
  let statusText = "Not signed in";
  try {
    const stat = fs.statSync(credPath);
    if (stat.isFile() && stat.size > 0) {
      loggedIn = true;
      statusText = "Signed in (subscription)";
    }
  } catch (_e) {}
  return { loggedIn, statusText, warnings };
}

module.exports.checkInstalled = checkInstalled;
module.exports.checkLoggedIn = checkLoggedIn;
```

- [ ] **Step 2:** Manual test

```bash
cd prototype/operation-runner
node src/operation-runner.js check --provider claude
```

Expected (if Claude Code is installed and signed in): `installed.installed: true`, `auth.loggedIn: true`. If not installed: `installed: false` with `installCommand` shown.

- [ ] **Step 3:** Commit

```bash
git add prototype/operation-runner/src/providers/claude.js
git commit -m "feat(claude): install + login detection with PATH fallback and API-key warning"
```

---

## Task 6: Claude provider — buildExecArgs, env, prompt

**Files:**
- Modify: `prototype/operation-runner/src/providers/claude.js`

- [ ] **Step 1:** Add the remaining methods

```js
function buildExecArgs(ctx) {
  const maxTurns = ctx.maxTurns && ctx.maxTurns > 0 ? ctx.maxTurns : 25;
  return [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--add-dir", ctx.workspace,
    "--model", ctx.model,
    "--max-turns", String(maxTurns),
  ];
}

function buildSpawnEnv(baseEnv) {
  const env = { ...baseEnv };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

function feedPrompt(child, prompt) {
  child.stdin.end(prompt);
}

module.exports.buildExecArgs = buildExecArgs;
module.exports.buildSpawnEnv = buildSpawnEnv;
module.exports.feedPrompt = feedPrompt;
```

- [ ] **Step 2:** Update `supportedModels` with the three real options

Replace the single-model array in `claude.js` with:

```js
supportedModels: [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", recommended: true },
  { id: "claude-opus-4-7", label: "Opus 4.7", description: "Heavy rate limits on Pro; Max recommended" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", description: "Fastest" },
],
```

- [ ] **Step 3:** Update `runProviderExec` in `operation-runner.js` to pass `cwd: workspace` (already does) and use `provider.buildSpawnEnv(process.env)`:

```js
const child = spawn(provider.binary, args, {
  cwd: paths.cwd,
  stdio: ["pipe", "pipe", "pipe"],
  env: provider.buildSpawnEnv(process.env),
});
```

- [ ] **Step 4:** Run contract test

```bash
cd prototype/operation-runner
node --test test/providers/contract.test.js
```

Expected: PASS.

- [ ] **Step 5:** Commit

```bash
git add prototype/operation-runner/src/providers/claude.js prototype/operation-runner/src/operation-runner.js
git commit -m "feat(claude): exec args, env stripping, stdin prompt"
```

---

## Task 7: Claude provider — finalizeLastMessage with TDD

**Files:**
- Create: `prototype/operation-runner/test/providers/claude.finalize.test.js`
- Modify: `prototype/operation-runner/src/providers/claude.js`

- [ ] **Step 1:** Write the failing tests

```js
// prototype/operation-runner/test/providers/claude.finalize.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const claude = require("../../src/providers/claude");

async function tmpdir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "claude-finalize-"));
}

test("finalizeLastMessage extracts the final result on success", async () => {
  const dir = await tmpdir();
  const eventsPath = path.join(dir, "events.jsonl");
  const lastMessagePath = path.join(dir, "last-message.md");
  await fsp.writeFile(
    eventsPath,
    [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "thinking" }] } }),
      JSON.stringify({ type: "result", subtype: "success", result: "Build wiki finished. Wrote 5 pages." }),
    ].join("\n") + "\n",
  );

  const out = await claude.finalizeLastMessage({ eventsPath, lastMessagePath });

  assert.equal(out.subtype, "success");
  assert.equal(fs.readFileSync(lastMessagePath, "utf8"), "Build wiki finished. Wrote 5 pages.");
});

test("finalizeLastMessage reports error_max_turns subtype", async () => {
  const dir = await tmpdir();
  const eventsPath = path.join(dir, "events.jsonl");
  const lastMessagePath = path.join(dir, "last-message.md");
  await fsp.writeFile(
    eventsPath,
    JSON.stringify({ type: "result", subtype: "error_max_turns", result: "" }) + "\n",
  );

  const out = await claude.finalizeLastMessage({ eventsPath, lastMessagePath });
  assert.equal(out.subtype, "error_max_turns");
});

test("finalizeLastMessage tolerates malformed lines", async () => {
  const dir = await tmpdir();
  const eventsPath = path.join(dir, "events.jsonl");
  const lastMessagePath = path.join(dir, "last-message.md");
  await fsp.writeFile(
    eventsPath,
    [
      "not json",
      JSON.stringify({ type: "result", subtype: "success", result: "ok" }),
      "",
    ].join("\n"),
  );

  const out = await claude.finalizeLastMessage({ eventsPath, lastMessagePath });
  assert.equal(out.subtype, "success");
  assert.equal(fs.readFileSync(lastMessagePath, "utf8"), "ok");
});
```

- [ ] **Step 2:** Run and verify failure

```bash
cd prototype/operation-runner
node --test test/providers/claude.finalize.test.js
```

Expected: FAIL with `Claude provider is stubbed` or similar.

- [ ] **Step 3:** Implement `finalizeLastMessage`

In `claude.js`:

```js
const fsp = require("node:fs/promises");

async function finalizeLastMessage(ctx) {
  let content = "";
  try {
    content = await fsp.readFile(ctx.eventsPath, "utf8");
  } catch (_e) {}

  let subtype = null;
  let result = "";
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (_e) {
      continue;
    }
    if (event && event.type === "result") {
      subtype = event.subtype || null;
      if (typeof event.result === "string") result = event.result;
    }
  }

  await fsp.writeFile(ctx.lastMessagePath, result);
  return { subtype };
}

module.exports.finalizeLastMessage = finalizeLastMessage;
```

- [ ] **Step 4:** Run tests, verify pass

```bash
cd prototype/operation-runner
node --test
```

Expected: all tests PASS.

- [ ] **Step 5:** Commit

```bash
git add prototype/operation-runner
git commit -m "feat(claude): finalize last message from stream-json events with tests"
```

---

## Task 8: Orchestration uses `finalizeLastMessage` and maps subtypes

**Files:**
- Modify: `prototype/operation-runner/src/operation-runner.js`

- [ ] **Step 1:** Call `provider.finalizeLastMessage` after the child exits, before diff

In `runBuildWiki`, after `runProviderExec` returns and before `diffSnapshot`:

```js
const finalize = await provider.finalizeLastMessage({
  eventsPath,
  lastMessagePath,
});
```

- [ ] **Step 2:** Map result subtypes to runner status

Replace the existing status decision (around lines 480–493) with:

```js
let status;
if (codexResult.timedOut) {
  status = "timed_out";
} else if (codexResult.cancelled) {
  status = "cancelled";
} else if (finalize.subtype === "error_max_turns") {
  status = "turn_budget_exceeded";
} else if (finalize.subtype === "error_during_execution" || codexResult.exitCode !== 0) {
  status = "provider_failed";
} else if (forbiddenCount > 0) {
  status = "completed_with_forbidden_edits_restored";
} else if (!producedExpectedContent && !options.dryRun) {
  status = "completed_without_wiki_content";
} else {
  status = "completed";
}
```

Note: `codex_failed` becomes `provider_failed` — same status semantics, neutral name.

- [ ] **Step 3:** Add `provider` and `model` to the report

In the `report` object construction, add:

```js
provider: provider.name,
model: options.model || provider.defaultModel,
```

- [ ] **Step 4:** Rename the report's `codex` field to `runner` for neutrality (or keep as `codex` for backwards compat — pick one and document). For this plan, **keep the field name as `codex` for backwards compat** with any existing reports; only the status string changes.

- [ ] **Step 5:** Manual test — Codex path still produces a valid report

```bash
cd prototype/operation-runner
npm run reset
npm run build
```

Expected: report.json contains `"provider": "codex"` and `"model": "gpt-5-codex"`. Status is `completed`.

- [ ] **Step 6:** Commit

```bash
git add prototype/operation-runner/src/operation-runner.js
git commit -m "feat: map provider result subtypes to runner status; add provider/model to report"
```

---

## Task 9: Update Build Wiki prompt — explicit image-read instruction + maxTurns

**Files:**
- Modify: `prototype/operation-runner/src/operation-runner.js`

- [ ] **Step 1:** Add the explicit-read instruction to `buildWikiPrompt`

In `buildWikiPrompt` (around line 683), add after the existing "Source handling" section:

```js
// Add to the prompt string:
`
Reading prepared images:
- Read every image listed under "Prepared source artifacts" before writing any wiki page.
- Treat skipping any prepared image as a failure mode.
- If a prepared text file is also present for a source, read both.
`
```

- [ ] **Step 2:** Pass `maxTurns` to `provider.buildExecArgs`

Compute it from prepared image count:

```js
const imageCount = preparedSources.imageAttachments.length;
const maxTurns = Math.max(25, imageCount + 20);

const args = provider.buildExecArgs({
  workspace,
  model: options.model || provider.defaultModel,
  lastMessagePath,
  imageAttachments: preparedSources.imageAttachments,
  maxTurns,
});
```

(Codex's `buildExecArgs` ignores `maxTurns` by design; only Claude uses it.)

- [ ] **Step 3:** Manual test on the sample workspace, both providers

```bash
cd prototype/operation-runner
npm run reset
node src/operation-runner.js build --provider codex
# inspect report
npm run reset
node src/operation-runner.js build --provider claude
# inspect report
```

Expected: both produce wiki pages, index.md update, log.md update. Compare the output qualitatively.

- [ ] **Step 4:** Commit

```bash
git add prototype/operation-runner/src/operation-runner.js
git commit -m "feat: explicit prepared-image-read instruction; per-provider max-turns"
```

---

## Task 10: Tauri — settings IO (read, write, defaults)

**Files:**
- Modify: `prototype/app-shell/src-tauri/src/lib.rs`
- Modify: `prototype/app-shell/src-tauri/Cargo.toml` (if `serde`/`serde_json` not already present — they are)

- [ ] **Step 1:** Add a settings struct + helpers

In `lib.rs`, near the top with other structs:

```rust
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    provider: String,
    models: std::collections::HashMap<String, String>,
}

fn default_settings() -> AppSettings {
    let mut models = std::collections::HashMap::new();
    models.insert("codex".to_string(), "gpt-5-codex".to_string());
    models.insert("claude".to_string(), "claude-sonnet-4-6".to_string());
    AppSettings { provider: "codex".to_string(), models }
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir()
        .map_err(|e| format!("appConfigDir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {e}"))?;
    Ok(dir.join("settings.json"))
}

fn read_settings(app: &tauri::AppHandle) -> AppSettings {
    let path = match settings_path(app) {
        Ok(p) => p,
        Err(_) => return default_settings(),
    };
    let bytes = match fs::read(&path) {
        Ok(b) => b,
        Err(_) => return default_settings(),
    };
    serde_json::from_slice::<AppSettings>(&bytes).unwrap_or_else(|_| default_settings())
}

fn write_settings(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let json = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}
```

- [ ] **Step 2:** Add three commands

```rust
#[tauri::command]
async fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(read_settings(&app))
}

#[tauri::command]
async fn set_provider(app: tauri::AppHandle, name: String) -> Result<AppSettings, String> {
    let mut settings = read_settings(&app);
    settings.provider = name;
    write_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
async fn set_model(app: tauri::AppHandle, provider: String, model_id: String) -> Result<AppSettings, String> {
    let mut settings = read_settings(&app);
    settings.models.insert(provider, model_id);
    write_settings(&app, &settings)?;
    Ok(settings)
}
```

- [ ] **Step 3:** Register the commands in `invoke_handler!` (around line 625):

```rust
.invoke_handler(tauri::generate_handler![
    // existing commands ...
    get_settings,
    set_provider,
    set_model,
])
```

- [ ] **Step 4:** Build and verify Rust compiles

```bash
cd prototype/app-shell
npm run tauri build -- --debug
```

Expected: clean build.

- [ ] **Step 5:** Commit

```bash
git add prototype/app-shell/src-tauri/src/lib.rs
git commit -m "feat(tauri): settings.json read/write with defaults"
```

---

## Task 11: Tauri — provider-aware commands

**Files:**
- Modify: `prototype/app-shell/src-tauri/src/lib.rs`

- [ ] **Step 1:** Add `list_providers` returning hardcoded metadata that mirrors the Node providers

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderModel {
    id: String,
    label: String,
    description: Option<String>,
    recommended: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderInfo {
    name: String,
    label: String,
    install_command: String,
    login_command: String,
    default_model: String,
    supported_models: Vec<ProviderModel>,
}

#[tauri::command]
async fn list_providers() -> Result<Vec<ProviderInfo>, String> {
    Ok(vec![
        ProviderInfo {
            name: "codex".into(),
            label: "ChatGPT (via Codex CLI)".into(),
            install_command: "npm i -g @openai/codex".into(),
            login_command: "codex login".into(),
            default_model: "gpt-5-codex".into(),
            supported_models: vec![
                ProviderModel { id: "gpt-5-codex".into(), label: "GPT-5 Codex".into(), description: None, recommended: Some(true) },
                ProviderModel { id: "gpt-5".into(), label: "GPT-5".into(), description: None, recommended: None },
                ProviderModel { id: "gpt-5-mini".into(), label: "GPT-5 Mini".into(), description: None, recommended: None },
            ],
        },
        ProviderInfo {
            name: "claude".into(),
            label: "Claude (via Claude Code CLI)".into(),
            install_command: "npm i -g @anthropic-ai/claude-code".into(),
            login_command: "claude".into(),
            default_model: "claude-sonnet-4-6".into(),
            supported_models: vec![
                ProviderModel { id: "claude-sonnet-4-6".into(), label: "Sonnet 4.6".into(), description: None, recommended: Some(true) },
                ProviderModel { id: "claude-opus-4-7".into(), label: "Opus 4.7".into(), description: Some("Heavy rate limits on Pro; Max recommended".into()), recommended: None },
                ProviderModel { id: "claude-haiku-4-5-20251001".into(), label: "Haiku 4.5".into(), description: Some("Fastest".into()), recommended: None },
            ],
        },
    ])
}
```

- [ ] **Step 2:** Replace `check_codex` with a generic `check_provider`

```rust
#[tauri::command]
async fn check_provider(name: String) -> Result<AppCommandResult, String> {
    let runner = run_runner(&["check", "--provider", &name])?;
    Ok(AppCommandResult { runner: Some(runner), state: load_state()? })
}
```

Keep the existing `check_codex` as a thin wrapper that calls `check_provider("codex".into())` to avoid breaking the React side mid-plan.

- [ ] **Step 3:** Add `install_provider` and `login_provider` (Terminal/osascript variants)

```rust
fn open_terminal_with(command: &str) -> Result<RunnerOutput, String> {
    let script = format!(r#"tell application "Terminal"
    activate
    do script "{}"
end tell"#, command.replace('"', "\\\""));
    let output = Command::new("osascript").arg("-e").arg(script).output()
        .map_err(|e| format!("osascript: {e}"))?;
    Ok(RunnerOutput {
        success: output.status.success(),
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

#[tauri::command]
async fn install_provider(name: String) -> Result<AppCommandResult, String> {
    let cmd = match name.as_str() {
        "codex" => "npm i -g @openai/codex",
        "claude" => "npm i -g @anthropic-ai/claude-code",
        other => return Err(format!("Unknown provider {other}")),
    };
    let runner = open_terminal_with(cmd)?;
    Ok(AppCommandResult { runner: Some(runner), state: load_state()? })
}

#[tauri::command]
async fn login_provider(name: String) -> Result<AppCommandResult, String> {
    let cmd = match name.as_str() {
        "codex" => "codex login",
        "claude" => "claude",
        other => return Err(format!("Unknown provider {other}")),
    };
    let runner = open_terminal_with(cmd)?;
    Ok(AppCommandResult { runner: Some(runner), state: load_state()? })
}
```

- [ ] **Step 4:** Update `build_wiki` to read settings and pass provider/model

In whichever existing command runs the build (look around line 240 where `Command::new(&node).arg("src/operation-runner.js")` lives), inject:

```rust
let settings = read_settings(&app);
let model = settings.models.get(&settings.provider).cloned().unwrap_or_else(|| {
    if settings.provider == "claude" { "claude-sonnet-4-6".into() } else { "gpt-5-codex".into() }
});

// build the runner argv to include:
//   build --provider <settings.provider> --model <model>
```

- [ ] **Step 5:** Register all new commands in `invoke_handler!`

- [ ] **Step 6:** Rebuild and verify

```bash
cd prototype/app-shell
npm run tauri build -- --debug
```

Expected: clean build.

- [ ] **Step 7:** Commit

```bash
git add prototype/app-shell/src-tauri/src/lib.rs
git commit -m "feat(tauri): provider-aware list/check/install/login + build_wiki passes provider/model"
```

---

## Task 12: React — Settings page

**Files:**
- Create: `prototype/app-shell/src/Settings.tsx`
- Create: `prototype/app-shell/src/settings.ts`
- Modify: `prototype/app-shell/src/App.tsx`

- [ ] **Step 1:** Define shared TypeScript types

```ts
// prototype/app-shell/src/settings.ts
export interface ProviderModel {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface ProviderInfo {
  name: string;
  label: string;
  installCommand: string;
  loginCommand: string;
  defaultModel: string;
  supportedModels: ProviderModel[];
}

export interface AppSettings {
  provider: string;
  models: Record<string, string>;
}
```

- [ ] **Step 2:** Build the Settings component

```tsx
// prototype/app-shell/src/Settings.tsx
import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, ProviderInfo } from "./settings";

interface ProviderStatus {
  installed: boolean;
  loggedIn: boolean;
  warnings?: string[];
}

interface Props { onClose: () => void; }

export function Settings({ onClose }: Props) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});

  const refreshStatus = useCallback(async (name: string) => {
    const result = await invoke<{ runner: { stdout: string } }>("check_provider", { name });
    try {
      const parsed = JSON.parse(result.runner.stdout);
      setStatuses((prev) => ({
        ...prev,
        [name]: {
          installed: parsed.installed?.installed === true,
          loggedIn: parsed.auth?.loggedIn === true,
          warnings: parsed.auth?.warnings || [],
        },
      }));
    } catch { /* ignore parse errors */ }
  }, []);

  useEffect(() => {
    invoke<ProviderInfo[]>("list_providers").then(setProviders);
    invoke<AppSettings>("get_settings").then(setSettings);
  }, []);

  useEffect(() => {
    providers.forEach((p) => refreshStatus(p.name));
  }, [providers, refreshStatus]);

  if (!settings) return <div>Loading…</div>;

  return (
    <div className="settings">
      <header><h2>Settings</h2><button onClick={onClose}>Close</button></header>
      <section>
        <h3>AI Provider</h3>
        {providers.map((p) => {
          const status = statuses[p.name] || { installed: false, loggedIn: false };
          const active = settings.provider === p.name;
          const selectedModel = settings.models[p.name] || p.defaultModel;
          return (
            <div key={p.name} className={`provider-row ${active ? "active" : ""}`}>
              <label>
                <input
                  type="radio"
                  name="provider"
                  checked={active}
                  onChange={async () => {
                    const updated = await invoke<AppSettings>("set_provider", { name: p.name });
                    setSettings(updated);
                  }}
                />
                <strong>{p.label}</strong>
              </label>

              <div className="model-row">
                Model:&nbsp;
                <select
                  value={selectedModel}
                  onChange={async (e) => {
                    const updated = await invoke<AppSettings>("set_model", {
                      provider: p.name,
                      modelId: e.target.value,
                    });
                    setSettings(updated);
                  }}
                >
                  {p.supportedModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}{m.recommended ? " (Recommended)" : ""}{m.description ? ` — ${m.description}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="status-row">
                {status.installed ? "✓ Installed" : "✗ Not installed"}
                &nbsp;·&nbsp;
                {status.loggedIn ? "✓ Signed in" : "✗ Not signed in"}
              </div>

              <div className="action-row">
                {!status.installed && (
                  <button onClick={async () => {
                    await invoke("install_provider", { name: p.name });
                    setTimeout(() => refreshStatus(p.name), 5000);
                  }}>Install in Terminal</button>
                )}
                {status.installed && !status.loggedIn && (
                  <button onClick={async () => {
                    await invoke("login_provider", { name: p.name });
                    setTimeout(() => refreshStatus(p.name), 5000);
                  }}>Sign in</button>
                )}
              </div>

              {(status.warnings || []).map((w, i) => (
                <div key={i} className="warning">⚠ {w}</div>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
```

- [ ] **Step 3:** Wire a Settings button into `App.tsx`

Add a button in the existing header area; clicking it sets local state `showSettings = true` and renders `<Settings onClose={() => setShowSettings(false)} />` in place of the main view (or as an overlay). Add minimal CSS in `App.css` for `.settings`, `.provider-row`, `.warning`.

- [ ] **Step 4:** Manual end-to-end test

```bash
cd prototype/app-shell
npm run tauri dev
```

In the running app:
1. Click the Settings button.
2. Verify both providers appear with correct labels and models.
3. Toggle the radio between Codex and Claude — close and re-open Settings — verify the choice persists.
4. Change Claude's model dropdown — verify persistence.
5. With Claude not signed in, click "Install in Terminal" — verify Terminal opens with the install command.

- [ ] **Step 5:** Commit

```bash
git add prototype/app-shell/src
git commit -m "feat(ui): Settings page with provider + model picker"
```

---

## Task 13: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1:** Reset the sample workspace

```bash
cd prototype/operation-runner
npm run reset
```

- [ ] **Step 2:** From the running Tauri dev app:

1. Open Settings, pick **ChatGPT (Codex)**, model **GPT-5 Codex**, close.
2. Click **Build wiki**.
3. Verify operation completes; wiki pages exist; report.json shows `"provider": "codex"`, `"model": "gpt-5-codex"`, `"status": "completed"`.
4. Click **Undo**. Verify rollback.
5. Open Settings, switch to **Claude**, model **Sonnet 4.6**, close.
6. Click **Build wiki**.
7. Verify operation completes; report.json shows `"provider": "claude"`, `"model": "claude-sonnet-4-6"`.
8. Inspect `events.jsonl` and confirm last line is a `result` event with `subtype: "success"`.
9. Click **Undo**. Verify rollback.

- [ ] **Step 3:** Document findings (especially image-quality comparison) in `docs/superpowers/notes/2026-05-02-claude-build-wiki-findings.md`

- [ ] **Step 4:** Commit findings doc

```bash
git add docs/superpowers/notes
git commit -m "docs: e2e verification notes for Claude provider"
```

---

## Self-Review (run after writing the plan)

- [ ] **Spec coverage check.** Walk through each section of `2026-05-02-claude-subscription-design.md` and confirm a task implements it:
  - File layout (Section "Architecture"): Tasks 2, 5–8.
  - Provider interface: Tasks 1, 2, 5–8.
  - Provider selection (`--provider`/`--model`): Task 3.
  - Settings UI: Task 12.
  - Settings storage: Task 10.
  - Codex provider table: Task 2.
  - Claude provider table: Tasks 5–7.
  - Three real differences (sandbox, last-message, images): Task 6 (sandbox via `--dangerously-skip-permissions`), Task 7 (last-message), Task 9 (image instruction + maxTurns).
  - Tauri shell changes: Tasks 10, 11.
  - Status renames + report fields: Task 8.
  - Edge cases (PATH fallback, env stripping): Tasks 5, 6.
  - Rollout order: matches Tasks 2 → 12.

- [ ] **Placeholder scan.** No "TBD", "TODO", "implement later", or vague "add error handling" steps in the body.

- [ ] **Type/method consistency check.**
  - `finalizeLastMessage` named consistently throughout (Tasks 1, 2, 7, 8).
  - `selectProvider` consistent in Tasks 2 and 3.
  - `provider.binary`, `provider.checkInstalled`, `provider.checkLoggedIn`, `provider.buildExecArgs`, `provider.buildSpawnEnv`, `provider.feedPrompt` all referenced consistently.
  - `set_model` Tauri command name matches React `invoke("set_model", { provider, modelId })`.

If any inconsistency is found at execution time, fix in the affected task and continue.

---

## Execution Notes

- The plan assumes the engineer can run `npm install` in both `prototype/operation-runner` and `prototype/app-shell` if dependencies are stale. Both already have `node_modules` checked into the repo per the existing layout.
- Any task whose manual verification fails should *not* be committed; investigate the root cause before moving to the next task.
- Provider-specific test runs (Tasks 9, 13) can be skipped on CI if Claude/Codex aren't available, but should be done locally before declaring the work done.
