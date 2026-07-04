import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const templateRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = path.resolve(process.argv[2] || process.env.MAPLE_WORKSPACE_PATH || "");
const outputRoot = path.resolve(
  process.argv[3] || process.env.MAPLE_PUBLIC_SITE_PATH || path.join(workspaceRoot, "public-site"),
);

async function main() {
  assertSafePaths();
  await assertWorkspace();
  await copyViewerTemplate();

  const metadata = await readSiteMetadata();
  await writeInitialHtmlMetadata(metadata);
  const result = spawnSync(
    process.execPath,
    [path.join(templateRoot, "scripts", "build-snapshot.mjs")],
    {
      cwd: templateRoot,
      env: {
        ...process.env,
        MAPLE_WORKSPACE_PATH: workspaceRoot,
        MAPLE_PUBLIC_WIKI_APP_ROOT: outputRoot,
        MAPLE_WIKI_TITLE: metadata.title,
        MAPLE_WIKI_SLUG: metadata.slug,
      },
      encoding: "utf8",
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Snapshot build failed with exit code ${result.status ?? "unknown"}.`);
  }

  console.log(`Exported Maple public site to ${outputRoot}`);
}

function assertSafePaths() {
  if (!workspaceRoot || workspaceRoot === path.parse(workspaceRoot).root) {
    throw new Error("A Maple workspace path is required.");
  }
  if (outputRoot === workspaceRoot) {
    throw new Error("Public site output cannot be the workspace root.");
  }
  const relative = path.relative(workspaceRoot, outputRoot);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Public site output must stay inside the Maple workspace.");
  }
}

async function assertWorkspace() {
  for (const item of ["index.md", "wiki"]) {
    const fullPath = path.join(workspaceRoot, item);
    try {
      await fs.stat(fullPath);
    } catch {
      throw new Error(`Missing required Maple workspace item: ${fullPath}`);
    }
  }
}

async function copyViewerTemplate() {
  await fs.mkdir(outputRoot, { recursive: true });

  for (const file of [
    "index.html",
    "package.json",
    "package-lock.json",
    "vercel.json",
    "vite.config.js",
  ]) {
    await copyFile(file);
  }

  for (const dir of ["api", "scripts", "src"]) {
    await copyDirectory(dir);
  }

  await fs.mkdir(path.join(outputRoot, "public"), { recursive: true });
  for (const file of ["favicon.svg", "maple-icon.png", "robots.txt"]) {
    await copyFile(path.join("public", file));
  }

  for (const generatedPath of [
    "api/data",
    "public/data",
    "public/published-assets",
    "public/published-sources",
  ]) {
    await fs.rm(path.join(outputRoot, generatedPath), { recursive: true, force: true });
  }
}

async function copyFile(relativePath) {
  const from = path.join(templateRoot, relativePath);
  const to = path.join(outputRoot, relativePath);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

async function copyDirectory(relativePath) {
  const from = path.join(templateRoot, relativePath);
  const to = path.join(outputRoot, relativePath);
  await fs.rm(to, { recursive: true, force: true });
  await fs.cp(from, to, {
    recursive: true,
    force: true,
    filter: (source) => !shouldSkipTemplatePath(source),
  });
}

function shouldSkipTemplatePath(source) {
  const relative = normalizePath(path.relative(templateRoot, source));
  const name = path.basename(relative);
  return (
    name === ".DS_Store" ||
    relative === "node_modules" ||
    relative.startsWith("node_modules/") ||
    relative === "dist" ||
    relative.startsWith("dist/") ||
    relative === ".vercel" ||
    relative.startsWith(".vercel/") ||
    name.startsWith(".env")
  );
}

async function readSiteMetadata() {
  const [teamConfig, publishConfig] = await Promise.all([
    readJson(path.join(workspaceRoot, ".aiwiki", "team.json")),
    readJson(path.join(workspaceRoot, ".aiwiki", "publish.json")),
  ]);
  const workspaceName = path.basename(workspaceRoot);
  const title =
    cleanString(publishConfig.siteTitle) ||
    cleanString(teamConfig.teamName) ||
    titleFromName(workspaceName);
  const slug = cleanSlug(publishConfig.siteSlug) || cleanSlug(teamConfig.teamName) || cleanSlug(workspaceName);
  return {
    title,
    slug: slug || "maple-wiki",
  };
}

async function writeInitialHtmlMetadata(metadata) {
  const title = cleanString(metadata.title) || "Maple Wiki";
  const indexPath = path.join(outputRoot, "index.html");
  let html = await fs.readFile(indexPath, "utf8");
  html = html
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<p class="initial-loading-title">.*?<\/p>/s,
      `<p class="initial-loading-title">${escapeHtml(title)}</p>`,
    );
  await fs.writeFile(indexPath, html);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanSlug(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function titleFromName(value) {
  const words = cleanString(value).replace(/[-_]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "Maple Wiki";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
