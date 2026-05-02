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
