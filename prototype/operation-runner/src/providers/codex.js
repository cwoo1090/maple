const { spawnSync } = require("node:child_process");
const { buildPathEnv, findBinary } = require("./path-utils");

function cleanCommandText(text) {
  return (text || "").trim() || null;
}

function checkInstalled() {
  const binPath = findBinary("codex");
  if (!binPath) return { installed: false, path: null, version: null };

  const version = spawnSync(binPath, ["--version"], {
    encoding: "utf8",
    env: buildSpawnEnv(process.env),
  });
  return {
    installed: true,
    path: binPath,
    version: cleanCommandText(version.stdout || version.stderr),
  };
}

function checkLoggedIn() {
  const binPath = findBinary("codex");
  if (!binPath) {
    return {
      loggedIn: false,
      statusText: "Codex CLI was not found",
      warnings: [],
    };
  }

  const login = spawnSync(binPath, ["login", "status"], {
    encoding: "utf8",
    env: buildSpawnEnv(process.env),
  });
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
    "--sandbox", ctx.sandbox || "workspace-write",
    "-c", 'approval_policy="never"',
    "--output-last-message", ctx.lastMessagePath,
    "-m", ctx.model,
  ];
  if (ctx.ephemeral) {
    args.push("--ephemeral");
  }
  for (const imagePath of ctx.imageAttachments || []) {
    args.push("--image", imagePath);
  }
  return args;
}

function askExecArgs(ctx) {
  const args = buildExecArgs({
    ...ctx,
    sandbox: "read-only",
    ephemeral: true,
    imageAttachments: ctx.imageAttachments || [],
  });
  if (ctx.webSearch) {
    args.unshift("--search");
  }
  return args;
}

function buildSpawnEnv(baseEnv) {
  return { ...baseEnv, PATH: buildPathEnv(baseEnv.PATH || "", baseEnv) };
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
  supportsImageAttachments: true,
  defaultModel: "gpt-5.5",
  supportedModels: [
    { id: "gpt-5.5", label: "GPT-5.5", recommended: true },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "Fastest" },
  ],
  installCommand: "npm i -g @openai/codex",
  loginCommand: "codex login",
  defaultTimeoutMs: 15 * 60 * 1000,
  checkInstalled,
  checkLoggedIn,
  buildExecArgs,
  askExecArgs,
  buildSpawnEnv,
  feedPrompt,
  finalizeLastMessage,
};
