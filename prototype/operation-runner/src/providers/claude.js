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

  // Path 1: filesystem credentials (some platforms / older versions)
  try {
    const stat = fs.statSync(credPath);
    if (stat.isFile() && stat.size > 0) {
      return { loggedIn: true, statusText: "Signed in (subscription)", warnings };
    }
  } catch (_e) {}

  // Path 2: macOS Keychain (current Claude Code default on darwin)
  if (process.platform === "darwin") {
    const keychainCheck = spawnSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials"],
      { encoding: "utf8" },
    );
    if (keychainCheck.status === 0) {
      return { loggedIn: true, statusText: "Signed in (subscription)", warnings };
    }
  }

  return { loggedIn: false, statusText: "Not signed in", warnings };
}

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
  checkInstalled,
  checkLoggedIn,
  buildExecArgs: NOT_IMPLEMENTED,
  buildSpawnEnv: (env) => ({ ...env }),
  feedPrompt: NOT_IMPLEMENTED,
  finalizeLastMessage: NOT_IMPLEMENTED,
};
