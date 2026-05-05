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
	    assert.equal(typeof provider.defaultTimeoutMs, "number");
	    assert.equal(typeof provider.supportsImageAttachments, "boolean");
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
