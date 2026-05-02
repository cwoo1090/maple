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
