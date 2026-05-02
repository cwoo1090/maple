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
