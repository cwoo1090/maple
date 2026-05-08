const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildPathEnv, findBinary, homeDir, providerOverridePath } = require("./path-utils");

function cleanCommandText(text) {
  return (text || "").trim() || null;
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

function detectLegacyAuthSource() {
  const credPath = path.join(homeDir(), ".claude", ".credentials.json");
  try {
    const stat = fs.statSync(credPath);
    if (stat.isFile() && stat.size > 0) return "subscription_file";
  } catch (_e) {}

  if (process.platform === "darwin") {
    const keychainCheck = spawnSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials"],
      { encoding: "utf8" },
    );
    if (keychainCheck.status === 0) return "subscription_keychain";
  }

  if (process.env.ANTHROPIC_API_KEY) return "api_key";

  return "none";
}

function parseAuthStatus(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_e) {
    return null;
  }
}

function isClaudeSubscriptionAuth(status) {
  if (!status || status.loggedIn !== true) return false;
  if (!status.authMethod && !status.apiProvider) return true;
  return status.authMethod === "claude.ai" || status.apiProvider === "firstParty";
}

function subscriptionStatusText(status) {
  const tier = typeof status?.subscriptionType === "string"
    ? status.subscriptionType.trim()
    : "";
  if (!tier) return "Signed in with Claude subscription";
  return `Signed in with Claude ${tier.charAt(0).toUpperCase()}${tier.slice(1)} subscription`;
}

function apiKeyWarning(baseEnv = process.env) {
  if (!baseEnv.ANTHROPIC_API_KEY) return [];
  return [
    "ANTHROPIC_API_KEY is set in your shell. Maple ignores it when launching Claude so your Claude subscription is used instead of API billing.",
  ];
}

function checkLoggedIn() {
  const warnings = apiKeyWarning(process.env);
  const binPath = findBinary("claude");

  if (binPath) {
    const auth = spawnSync(binPath, ["auth", "status"], {
      encoding: "utf8",
      env: buildSpawnEnv(process.env),
    });
    const statusText = cleanCommandText(auth.stdout || auth.stderr);
    const parsed = parseAuthStatus(statusText);

    if (parsed) {
      if (isClaudeSubscriptionAuth(parsed)) {
        return { loggedIn: true, statusText: subscriptionStatusText(parsed), warnings };
      }

      if (parsed.loggedIn === true) {
        return {
          loggedIn: false,
          statusText: "Claude is signed in with API billing. Run `claude auth login --claudeai` to use your subscription.",
          warnings,
        };
      }

      return { loggedIn: false, statusText: "Not signed in", warnings };
    }

    if (auth.status === 0 && /logged\s*in|authenticated/i.test(statusText || "")) {
      return { loggedIn: true, statusText: "Signed in with Claude subscription", warnings };
    }

    const unsupportedAuthStatus = /unknown command|invalid command|unrecognized command/i.test(
      statusText || "",
    );
    if (auth.status !== 0 && !unsupportedAuthStatus) {
      return {
        loggedIn: false,
        statusText: "Claude auth status did not confirm a subscription login",
        warnings,
      };
    }
  }

  const source = detectLegacyAuthSource();
  if (source === "subscription_file" || source === "subscription_keychain") {
    return { loggedIn: true, statusText: "Signed in with Claude subscription", warnings };
  }

  if (source === "api_key") {
    return {
      loggedIn: false,
      statusText: "Only ANTHROPIC_API_KEY was found. Sign in with Claude subscription auth instead.",
      warnings: [
        "Maple does not use ANTHROPIC_API_KEY for the MVP because it can bill API credits. Run `claude auth login --claudeai` to use your Claude subscription.",
      ],
    };
  }

  return { loggedIn: false, statusText: "Not signed in", warnings };
}

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

function askExecArgs(ctx) {
  const maxTurns = ctx.maxTurns && ctx.maxTurns > 0 ? ctx.maxTurns : 8;
  const tools = ctx.webSearch ? "Read,Grep,Glob,WebSearch,WebFetch" : "Read,Grep,Glob";
  return [
    "-p",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--no-session-persistence",
    "--tools", tools,
    "--add-dir", ctx.workspace,
    "--model", ctx.model,
    "--max-turns", String(maxTurns),
  ];
}

function buildSpawnEnv(baseEnv) {
  const env = { ...baseEnv };
  env.PATH = buildPathEnv(baseEnv.PATH || "", baseEnv);
  delete env.ANTHROPIC_API_KEY;
  return env;
}

function feedPrompt(child, prompt) {
  child.stdin.end(prompt);
}

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

module.exports = {
  name: "claude",
  binary: providerOverridePath("claude") || "claude",
  supportsImageAttachments: false,
  defaultModel: "claude-sonnet-4-6",
  supportedModels: [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", recommended: true },
    { id: "claude-opus-4-7", label: "Opus 4.7", description: "Heavy rate limits on Pro; Max recommended" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", description: "Fastest" },
  ],
  installCommand: "npm i -g @anthropic-ai/claude-code",
  loginCommand: "claude auth login --claudeai",
  defaultTimeoutMs: 30 * 60 * 1000,
  checkInstalled,
  checkLoggedIn,
  buildExecArgs,
  askExecArgs,
  buildSpawnEnv,
  feedPrompt,
  finalizeLastMessage,
};
