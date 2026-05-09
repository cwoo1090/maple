const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const codex = require("../../src/providers/codex");
const claude = require("../../src/providers/claude");

const REQUIRED_FIELDS = [
  "name",
  "binary",
  "defaultModel",
  "defaultReasoningEffort",
  "supportedReasoningEfforts",
  "supportedModels",
  "installCommand",
  "loginCommand",
  "defaultTimeoutMs",
];

const REQUIRED_METHODS = [
  "checkInstalled",
  "checkLoggedIn",
  "buildExecArgs",
  "askExecArgs",
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
    assert.ok(Array.isArray(provider.supportedReasoningEfforts));
    assert.ok(provider.supportedReasoningEfforts.length > 0);
    for (const model of provider.supportedModels) {
      assert.equal(typeof model.defaultReasoningEffort, "string");
      assert.ok(Array.isArray(model.supportedReasoningEfforts));
      assert.ok(model.supportedReasoningEfforts.length > 0);
    }
    assert.equal(typeof provider.defaultTimeoutMs, "number");
    assert.equal(typeof provider.supportsImageAttachments, "boolean");
    assert.equal(typeof provider.supportsImagePathReferences, "boolean");
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

test("claude ask enables partial message streaming", () => {
  const args = claude.askExecArgs({
    workspace: "/tmp/workspace",
    model: claude.defaultModel,
    lastMessagePath: "/tmp/last.md",
  });

  assert.ok(args.includes("--include-partial-messages"));
  assert.ok(args.includes("stream-json"));
});

test("provider visual input capabilities are explicit", () => {
  assert.equal(codex.supportsImageAttachments, true);
  assert.equal(codex.supportsImagePathReferences, false);
  assert.equal(claude.supportsImageAttachments, false);
  assert.equal(claude.supportsImagePathReferences, true);
});

test("claude build forwards selected reasoning effort", () => {
  const args = claude.buildExecArgs({
    workspace: "/tmp/workspace",
    model: claude.defaultModel,
    reasoningEffort: "max",
    lastMessagePath: "/tmp/last.md",
  });

  assert.equal(args[args.indexOf("--effort") + 1], "max");
});

test("claude ask keeps web tools out of source-only explore", () => {
  const args = claude.askExecArgs({
    workspace: "/tmp/workspace",
    model: claude.defaultModel,
    lastMessagePath: "/tmp/last.md",
  });

  const tools = args[args.indexOf("--tools") + 1];
  assert.equal(tools, "Read,Grep,Glob");
});

test("claude ask enables web tools only when requested", () => {
  const args = claude.askExecArgs({
    workspace: "/tmp/workspace",
    model: claude.defaultModel,
    lastMessagePath: "/tmp/last.md",
    webSearch: true,
  });

  const tools = args[args.indexOf("--tools") + 1];
  assert.equal(tools, "Read,Grep,Glob,WebSearch,WebFetch");
});

test("claude spawn env prefers subscription auth and user-local binaries", () => {
  const env = claude.buildSpawnEnv({
    HOME: "/tmp/maple-home",
    PATH: "/usr/bin",
    ANTHROPIC_API_KEY: "test-key",
  });

  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.ok(env.PATH.split(":").includes("/tmp/maple-home/.local/bin"));
  assert.ok(env.PATH.split(":").includes("/tmp/maple-home/.claude/bin"));
});

test("codex spawn env includes user-local binaries", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maple-path-home-"));
  fs.writeFileSync(path.join(home, ".npmrc"), "prefix=~/.npm-custom\n");
  const env = codex.buildSpawnEnv({
    HOME: home,
    PATH: "/usr/bin",
    VOLTA_HOME: `${home}/volta`,
    ASDF_DATA_DIR: `${home}/asdf-data`,
    MISE_DATA_DIR: `${home}/mise-data`,
    PNPM_HOME: `${home}/pnpm-home`,
    NPM_CONFIG_PREFIX: `${home}/npm-prefix`,
  });
  const parts = env.PATH.split(":");

  assert.ok(parts.includes(`${home}/.local/bin`));
  assert.ok(parts.includes(`${home}/.npm-global/bin`));
  assert.ok(parts.includes(`${home}/.npm-custom/bin`));
  assert.ok(parts.includes(`${home}/volta/bin`));
  assert.ok(parts.includes(`${home}/asdf-data/shims`));
  assert.ok(parts.includes(`${home}/mise-data/shims`));
  assert.ok(parts.includes(`${home}/pnpm-home`));
  assert.ok(parts.includes(`${home}/pnpm-home/bin`));
});

test("codex ask forwards image attachments", () => {
  const args = codex.askExecArgs({
    workspace: "/tmp/workspace",
    model: codex.defaultModel,
    lastMessagePath: "/tmp/last.md",
    imageAttachments: ["/tmp/workspace/wiki/assets/chart.png"],
  });

  assert.ok(args.includes("--image"));
  assert.ok(args.includes("/tmp/workspace/wiki/assets/chart.png"));
});

test("codex build forwards selected reasoning effort as config", () => {
  const args = codex.buildExecArgs({
    workspace: "/tmp/workspace",
    model: codex.defaultModel,
    reasoningEffort: "xhigh",
    lastMessagePath: "/tmp/last.md",
  });

  assert.ok(args.includes('model_reasoning_effort="xhigh"'));
});

test("codex ask leaves source-only args unchanged", () => {
  const args = codex.askExecArgs({
    workspace: "/tmp/workspace",
    model: codex.defaultModel,
    lastMessagePath: "/tmp/last.md",
  });

  assert.equal(args[0], "exec");
  assert.equal(args.includes("--search"), false);
});

test("codex ask puts web search before exec and keeps images", () => {
  const args = codex.askExecArgs({
    workspace: "/tmp/workspace",
    model: codex.defaultModel,
    lastMessagePath: "/tmp/last.md",
    imageAttachments: ["/tmp/workspace/wiki/assets/chart.png"],
    webSearch: true,
  });

  assert.deepEqual(args.slice(0, 2), ["--search", "exec"]);
  assert.ok(args.includes("--image"));
  assert.ok(args.includes("/tmp/workspace/wiki/assets/chart.png"));
});
