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
