const fs = require("node:fs");
const fsp = require("node:fs/promises");
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

function detectAuthSource() {
  const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
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

function checkLoggedIn() {
  const source = detectAuthSource();
  const warnings = [];

  if (source === "subscription_file" || source === "subscription_keychain") {
    if (process.env.ANTHROPIC_API_KEY) {
      warnings.push(
        "ANTHROPIC_API_KEY is set in your shell. Claude Code prefers it over your subscription, so this build will use API credits instead. Unset the env var to force subscription billing.",
      );
    }
    return { loggedIn: true, statusText: "Signed in (subscription)", warnings };
  }

  if (source === "api_key") {
    return {
      loggedIn: true,
      statusText: "Using ANTHROPIC_API_KEY (per-token billing)",
      warnings: [
        "No Claude subscription credentials found. This build will use ANTHROPIC_API_KEY and bill per-token. Sign in with `claude` in Terminal to use your Pro/Max subscription instead.",
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

function buildSpawnEnv(baseEnv) {
  return { ...baseEnv };
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
  binary: "claude",
  defaultModel: "claude-sonnet-4-6",
  supportedModels: [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", recommended: true },
    { id: "claude-opus-4-7", label: "Opus 4.7", description: "Heavy rate limits on Pro; Max recommended" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", description: "Fastest" },
  ],
  installCommand: "npm i -g @anthropic-ai/claude-code",
  loginCommand: "claude",
  defaultTimeoutMs: 30 * 60 * 1000,
  checkInstalled,
  checkLoggedIn,
  buildExecArgs,
  buildSpawnEnv,
  feedPrompt,
  finalizeLastMessage,
};
