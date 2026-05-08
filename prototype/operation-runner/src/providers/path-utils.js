const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const COMMON_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/opt/local/bin",
  "/opt/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
  "/nix/var/nix/profiles/default/bin",
  "/run/current-system/sw/bin",
];

function homeDir(baseEnv = process.env) {
  return baseEnv.HOME || os.homedir();
}

function expandHomePath(part, baseEnv = process.env) {
  if (part === "~") return homeDir(baseEnv);
  if (part.startsWith("~/")) return path.join(homeDir(baseEnv), part.slice(2));
  return part;
}

function pushPathPart(parts, part, baseEnv = process.env) {
  const expanded = expandHomePath(part, baseEnv);
  if (!expanded || parts.includes(expanded)) return;
  parts.push(expanded);
}

function pushPathParts(parts, pathValue, baseEnv = process.env) {
  for (const part of (pathValue || "").split(path.delimiter)) {
    pushPathPart(parts, part, baseEnv);
  }
}

function existingChildDirs(root, mapper) {
  try {
    return fs
      .readdirSync(root)
      .map((entry) => mapper(entry))
      .filter((dir) => fs.existsSync(dir));
  } catch (_error) {
    return [];
  }
}

function collectNestedBinDirs(root, maxDepth, shouldInclude) {
  const out = [];
  const visit = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (entry.name === "bin" && shouldInclude(child)) {
        out.push(child);
      }
      visit(child, depth + 1);
    }
  };
  visit(root, 0);
  return out;
}

function nvmBinDirs(baseEnv = process.env) {
  const versionsRoot = path.join(homeDir(baseEnv), ".nvm", "versions", "node");
  return existingChildDirs(versionsRoot, (version) => path.join(versionsRoot, version, "bin"))
    .sort()
    .reverse();
}

function fnmRoots(baseEnv = process.env) {
  const home = homeDir(baseEnv);
  const roots = [];
  if (baseEnv.FNM_DIR) roots.push(baseEnv.FNM_DIR);
  if (baseEnv.XDG_DATA_HOME) roots.push(path.join(baseEnv.XDG_DATA_HOME, "fnm"));
  roots.push(path.join(home, "Library", "Application Support", "fnm"));
  roots.push(path.join(home, ".local", "share", "fnm"));
  return roots;
}

function fnmBinDirs(baseEnv = process.env) {
  const dirs = [];
  if (baseEnv.FNM_MULTISHELL_PATH) dirs.push(baseEnv.FNM_MULTISHELL_PATH);
  for (const root of fnmRoots(baseEnv)) {
    dirs.push(...collectNestedBinDirs(path.join(root, "node-versions"), 4, () => true));
  }
  const stateHome = baseEnv.XDG_STATE_HOME || path.join(homeDir(baseEnv), ".local", "state");
  dirs.push(
    ...existingChildDirs(path.join(stateHome, "fnm_multishells"), (entry) =>
      path.join(stateHome, "fnm_multishells", entry, "bin"),
    ),
  );
  return dirs;
}

function npmPrefixDirs(baseEnv = process.env) {
  const home = homeDir(baseEnv);
  const prefixes = [
    baseEnv.npm_config_prefix,
    baseEnv.NPM_CONFIG_PREFIX,
    ...npmrcPrefixes(home),
    path.join(home, ".npm-global"),
    path.join(home, ".npm-packages"),
    path.join(home, ".node"),
  ].filter(Boolean);
  return prefixes.map((prefix) => path.join(expandHomePath(prefix, baseEnv), "bin"));
}

function npmrcPrefixes(home) {
  const prefixes = [];
  for (const file of [path.join(home, ".npmrc")]) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (_error) {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*prefix\s*=\s*(.+?)\s*$/);
      if (match) prefixes.push(match[1].replace(/^\$\{HOME\}/, home).replace(/^\$HOME/, home));
    }
  }
  return prefixes;
}

function versionManagerDirs(baseEnv = process.env) {
  const home = homeDir(baseEnv);
  const asdfData = baseEnv.ASDF_DATA_DIR || path.join(home, ".asdf");
  const miseData = baseEnv.MISE_DATA_DIR || path.join(home, ".local", "share", "mise");
  const voltaHome = baseEnv.VOLTA_HOME || path.join(home, ".volta");
  return [
    path.join(voltaHome, "bin"),
    path.join(asdfData, "shims"),
    path.join(asdfData, "bin"),
    path.join(miseData, "shims"),
    path.join(home, ".mise", "shims"),
    ...nvmBinDirs(baseEnv),
    ...fnmBinDirs(baseEnv),
  ];
}

function packageManagerDirs(baseEnv = process.env) {
  const home = homeDir(baseEnv);
  const pnpmHome = baseEnv.PNPM_HOME;
  return [
    ...npmPrefixDirs(baseEnv),
    pnpmHome,
    pnpmHome ? path.join(pnpmHome, "bin") : null,
    path.join(home, "Library", "pnpm"),
    path.join(home, "Library", "pnpm", "bin"),
    path.join(home, ".local", "share", "pnpm"),
    path.join(home, ".local", "share", "pnpm", "bin"),
    path.join(home, ".yarn", "bin"),
    path.join(home, ".config", "yarn", "global", "node_modules", ".bin"),
    path.join(home, ".bun", "bin"),
  ].filter(Boolean);
}

function userBinDirs(baseEnv = process.env) {
  const home = homeDir(baseEnv);
  return [
    path.join(home, ".local", "bin"),
    path.join(home, "bin"),
    path.join(home, ".claude", "bin"),
    path.join(home, ".nix-profile", "bin"),
    ...packageManagerDirs(baseEnv),
    ...versionManagerDirs(baseEnv),
  ];
}

function buildPathEnv(basePath = process.env.PATH || "", baseEnv = process.env) {
  const parts = [];
  for (const name of ["codex", "claude"]) {
    const override = providerOverridePath(name, baseEnv);
    if (override) pushPathPart(parts, path.dirname(override), baseEnv);
  }
  pushPathParts(parts, basePath, baseEnv);
  for (const dir of userBinDirs(baseEnv)) pushPathPart(parts, dir, baseEnv);
  for (const dir of COMMON_BIN_DIRS) pushPathPart(parts, dir, baseEnv);
  return parts.join(path.delimiter);
}

function providerOverrideEnvName(name) {
  if (name === "codex") return "MAPLE_CODEX_PATH";
  if (name === "claude") return "MAPLE_CLAUDE_PATH";
  return null;
}

function providerOverridePath(name, baseEnv = process.env) {
  const envName = providerOverrideEnvName(name);
  const value = envName ? baseEnv[envName] : "";
  return value && path.basename(value) === name ? value : null;
}

function findBinary(name, baseEnv = process.env) {
  const override = providerOverridePath(name, baseEnv);
  if (override) return override;

  const pathEnv = buildPathEnv(baseEnv.PATH || "", baseEnv);
  for (const dir of pathEnv.split(path.delimiter)) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }

  const probe =
    process.platform === "win32"
      ? spawnSync("where", [name], { encoding: "utf8" })
      : spawnSync("sh", ["-lc", `command -v ${name}`], {
          encoding: "utf8",
          env: { ...baseEnv, PATH: pathEnv },
        });

  if (probe.status === 0 && probe.stdout.trim()) {
    return probe.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

module.exports = {
  buildPathEnv,
  findBinary,
  homeDir,
  providerOverridePath,
};
