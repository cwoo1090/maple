import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import sanitizeHtml from "sanitize-html";
import { enableMathProtection } from "../src/markdown-math.js";

const templateRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const appRoot = path.resolve(process.env.MAPLE_PUBLIC_WIKI_APP_ROOT || templateRoot);
const workspaceRoot = process.env.MAPLE_WORKSPACE_PATH
  ? path.resolve(process.env.MAPLE_WORKSPACE_PATH)
  : "";
const wikiSlug = process.env.MAPLE_WIKI_SLUG || "maple-wiki";
const wikiTitle = process.env.MAPLE_WIKI_TITLE || "Maple Wiki";

const publicDir = path.join(appRoot, "public");
const dataDir = path.join(publicDir, "data");
const apiDataDir = path.join(appRoot, "api", "data");
const assetOutDir = path.join(publicDir, "published-assets");
const sourceOutDir = path.join(publicDir, "published-sources");

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})
  .use(enableMathProtection)
  .use(anchor, {
    level: [1, 2, 3, 4],
    slugify: slugifyHeading,
    permalink: anchor.permalink.linkInsideHeader({
      symbol: "#",
      placement: "after",
      class: "heading-anchor",
      ariaHidden: true,
    }),
  });
const defaultFenceRenderer = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
  if (language === "mermaid") {
    return `<div class="mermaid">${md.utils.escapeHtml(token.content)}</div>\n`;
  }
  return defaultFenceRenderer
    ? defaultFenceRenderer(tokens, idx, options, env, self)
    : `<pre><code>${md.utils.escapeHtml(token.content)}</code></pre>\n`;
};

const sanitizeOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img",
    "figure",
    "figcaption",
    "span",
    "sup",
    "sub",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "details",
    "summary",
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ["href", "name", "target", "rel", "class"],
    img: ["src", "alt", "title", "loading"],
    span: ["class", "style", "aria-hidden"],
    div: ["class", "style"],
    code: ["class"],
    pre: ["class"],
    th: ["align"],
    td: ["align"],
    h1: ["id"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
};

async function main() {
  await assertWorkspace();
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.rm(apiDataDir, { recursive: true, force: true });
  await fs.rm(assetOutDir, { recursive: true, force: true });
  await fs.rm(sourceOutDir, { recursive: true, force: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(apiDataDir, { recursive: true });
  await fs.mkdir(assetOutDir, { recursive: true });
  await fs.mkdir(sourceOutDir, { recursive: true });

  const pagePaths = await collectPagePaths();
  const pageLookup = buildPageLookup(pagePaths);
  const publishSettings = await readPublishSettings();
  const sourceManifest = await readSourceManifest();
  const sourceEntries = await buildSourceEntries(sourceManifest, publishSettings);
  await copyPublicSources(sourceEntries);
  const publicSourcePaths = new Set(
    sourceEntries.filter((source) => source.public).map((source) => source.path),
  );
  const copiedAssets = new Map();

  const pages = [];
  const searchIndex = [];
  const chatChunks = [];

  for (const relativePath of pagePaths) {
    const page = await buildPage(relativePath, pageLookup, copiedAssets, publicSourcePaths);
    pages.push(page);
    searchIndex.push({
      pageKey: page.key,
      title: page.title,
      path: page.path,
      text: page.text,
      excerpt: page.excerpt,
    });
    chatChunks.push(...chunkPage(page));
  }

  pages.sort(comparePages);
  searchIndex.sort((a, b) => a.title.localeCompare(b.title));
  const globalDocs = await buildGlobalDocs(pages);

  const publicSources = sourceEntries.filter((source) => source.public);
  const manifest = {
    schemaVersion: 1,
    title: wikiTitle,
    slug: wikiSlug,
    generatedAt: new Date().toISOString(),
    visibility: "public_noindex",
    sourcePolicy: publishSettings.publicSources
      ? "all_sources_public_by_default"
      : "sources_private_by_default",
    pageCount: pages.length,
    sourceCount: sourceEntries.length,
    publicSourceCount: publicSources.length,
    hiddenSourceCount: sourceEntries.length - publicSources.length,
    assetCount: copiedAssets.size,
    chatChunkCount: chatChunks.length,
  };

  const snapshot = {
    manifest,
    pages,
    sources: publicSources,
    searchIndex,
    chatChunks,
  };

  const chatData = {
    manifest,
    globalDocs,
    pages: pages.map(({ key, title, path, text, excerpt, images }) => ({
      key,
      title,
      path,
      text,
      excerpt,
      images,
    })),
    chunks: chatChunks,
  };

  await fs.writeFile(
    path.join(dataDir, "snapshot.json"),
    JSON.stringify(snapshot, null, 2),
  );
  await fs.writeFile(
    path.join(apiDataDir, "chat-data.json"),
    JSON.stringify(chatData),
  );

  console.log(
    `Built ${pages.length} pages, ${chatChunks.length} chat chunks, ${copiedAssets.size} assets.`,
  );
  console.log(`Public sources: ${publicSources.length}/${sourceEntries.length}`);
}

async function assertWorkspace() {
  if (!workspaceRoot) {
    throw new Error("MAPLE_WORKSPACE_PATH is required to build a public wiki snapshot.");
  }
  const required = ["index.md", "wiki"];
  for (const item of required) {
    const fullPath = path.join(workspaceRoot, item);
    try {
      await fs.stat(fullPath);
    } catch {
      throw new Error(`Missing required Maple workspace item: ${fullPath}`);
    }
  }
}

async function collectPagePaths() {
  const pagePaths = ["index.md"];
  const wikiRoot = path.join(workspaceRoot, "wiki");
  const files = await walk(wikiRoot);
  for (const filePath of files) {
    const relativePath = normalizePath(path.relative(workspaceRoot, filePath));
    if (!relativePath.endsWith(".md")) continue;
    if (relativePath === "wiki/assets/README.md") continue;
    pagePaths.push(relativePath);
  }
  return pagePaths.sort(comparePagePaths);
}

async function buildGlobalDocs(pages) {
  const docs = [];
  const indexPage = pages.find((page) => page.key === "index");
  if (indexPage) {
    docs.push({
      key: "index",
      title: indexPage.title,
      path: "index.md",
      text: indexPage.text,
    });
  }

  try {
    const schemaPath = path.join(workspaceRoot, "schema.md");
    const raw = await fs.readFile(schemaPath, "utf8");
    const parsed = matter(raw);
    docs.push({
      key: "schema",
      title: parsed.data.title || firstHeading(parsed.content) || "Workspace Schema",
      path: "schema.md",
      text: markdownToText(parsed.content),
    });
  } catch {
    // Older exported workspaces may not include schema.md.
  }

  return docs;
}

async function walk(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function buildPageLookup(pagePaths) {
  const lookup = new Map();
  for (const relativePath of pagePaths) {
    const key = pageKeyForPath(relativePath);
    const basename = path.basename(relativePath, ".md");
    lookup.set(key, key);
    lookup.set(basename, key);
  }
  return lookup;
}

async function readSourceManifest() {
  const manifestPath = path.join(workspaceRoot, ".aiwiki", "source-manifest.json");
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    return { files: [] };
  }
}

async function readPublishSettings() {
  const publishPath = path.join(workspaceRoot, ".aiwiki", "publish.json");
  try {
    const parsed = JSON.parse(await fs.readFile(publishPath, "utf8"));
    return {
      publicSources: parsed.publicSources === true,
    };
  } catch {
    return {
      publicSources: false,
    };
  }
}

async function buildSourceEntries(sourceManifest, publishSettings) {
  const entries = [];
  for (const file of (sourceManifest.files || [])
    .filter((file) => file.path?.startsWith("sources/"))
  ) {
    const sourcePath = file.path;
    const type = sourceTypeForPath(sourcePath);
    const isPublic = publishSettings.publicSources === true;
    const entry = {
      key: sourceKeyForPath(sourcePath),
      path: sourcePath,
      title: sourceTitleForPath(sourcePath),
      type,
      public: isPublic,
      url: isPublic ? sourceRouteForPath(sourcePath) : null,
      rawUrl: isPublic ? `/published-sources/${encodeURIPath(sourcePath)}` : null,
      size: file.size || null,
      sha256: file.sha256 || null,
      contentHtml: null,
      contentText: null,
    };

    if (isPublic && (type === "markdown" || type === "text")) {
      const raw = await fs.readFile(path.join(workspaceRoot, sourcePath), "utf8");
      entry.contentText = raw;
      entry.contentHtml =
        type === "markdown"
          ? sanitizeHtml(md.render(raw), sanitizeOptions)
          : `<pre>${escapeHtml(raw)}</pre>`;
    }

    entries.push(entry);
  }
  return entries;
}

async function copyPublicSources(sourceEntries) {
  for (const source of sourceEntries) {
    if (!source.public) continue;
    const sourcePath = path.join(workspaceRoot, source.path);
    const outPath = path.join(sourceOutDir, source.path);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.copyFile(sourcePath, outPath);
  }
}

async function buildPage(relativePath, pageLookup, copiedAssets, publicSourcePaths) {
  const fullPath = path.join(workspaceRoot, relativePath);
  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = matter(raw);
  const title = parsed.data.title || firstHeading(parsed.content) || titleFromPath(relativePath);
  const key = pageKeyForPath(relativePath);
  const unit = buildUnitMetadata(parsed.content);
  const prepared = await prepareMarkdown(
    parsed.content,
    relativePath,
    pageLookup,
    copiedAssets,
    publicSourcePaths,
  );
  const markdown = prepared.markdown;
  const rendered = md.render(markdown);
  const html = sanitizeHtml(rendered, sanitizeOptions);
  const text = markdownToText(markdown);
  const headings = extractHeadings(markdown);

  return {
    key,
    title,
    path: pagePathForKey(key),
    type: pageTypeForKey(key),
    html,
    text,
    excerpt: makeExcerpt(text),
    headings,
    images: prepared.images,
    unit: unit ? buildUnitSnapshot(unit, prepared.structuredMarkdown) : null,
    updated: parsed.data.updated || null,
  };
}

async function prepareMarkdown(markdown, relativePath, pageLookup, copiedAssets, publicSourcePaths) {
  let text = markdown;
  let images = [];
  text = replaceWikiLinks(text, pageLookup);
  const imageResult = await rewriteImages(text, relativePath, copiedAssets);
  text = imageResult.markdown;
  images = imageResult.images;
  text = rewriteMarkdownLinks(text, relativePath, pageLookup, publicSourcePaths);
  const structuredMarkdown = text;
  text = stripIbwikiMarkers(text);
  text = stripObsidianCallouts(text);
  return {
    markdown: text.trim(),
    structuredMarkdown: structuredMarkdown.trim(),
    images,
  };
}

function replaceWikiLinks(markdown, pageLookup) {
  return markdown.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const key = pageLookup.get(target.trim());
    const linkText = label?.trim() || target.trim();
    if (!key) return linkText;
    return `[${linkText}](${pagePathForKey(key)})`;
  });
}

async function rewriteImages(markdown, relativePath, copiedAssets) {
  const dir = path.dirname(relativePath);
  const pageKey = pageKeyForPath(relativePath);
  const imagePattern = /!\[([^\]]*)\]\((<?)([^)\s>]+(?:\s[^)>]+)?)(>?)\)/g;
  const replacements = [];
  const images = [];
  for (const match of markdown.matchAll(imagePattern)) {
    const [full, alt, , rawTarget] = match;
    const target = rawTarget.trim().replace(/^<|>$/g, "");
    if (isRemoteUrl(target)) continue;
    const cleanTarget = target.split("#")[0];
    const resolved = normalizePath(path.normalize(path.join(dir, cleanTarget)));
    if (!resolved.startsWith("wiki/assets/")) continue;
    const sourcePath = path.join(workspaceRoot, resolved);
    const outPath = path.join(assetOutDir, resolved);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.copyFile(sourcePath, outPath);
    const publicSrc = `/published-assets/${encodeURIPath(resolved)}`;
    const stat = await fs.stat(sourcePath);
    copiedAssets.set(resolved, publicSrc);
    images.push({
      key: `${pageKey}::image-${images.length}`,
      src: publicSrc,
      assetPath: resolved,
      filename: path.basename(resolved),
      alt: alt.trim(),
      heading: headingBefore(markdown, match.index || 0),
      mimeType: imageMimeTypeForPath(resolved),
      size: stat.size,
    });
    replacements.push([
      full,
      `![${alt}](${publicSrc})`,
    ]);
  }
  let next = markdown;
  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
  }
  return {
    markdown: next,
    images,
  };
}

function headingBefore(markdown, index) {
  const before = markdown.slice(0, index);
  const headings = [...before.matchAll(/^#{1,4}\s+(.+)$/gm)];
  const heading = headings.at(-1)?.[1] || "";
  return heading.replace(/\s+#$/, "").trim();
}

function rewriteMarkdownLinks(markdown, relativePath, pageLookup, publicSourcePaths) {
  const dir = path.dirname(relativePath);
  return markdown.replace(/(^|[^!])\[([^\]]+)\]\((<?)([^)>]+)(>?)\)/g, (full, prefix, label, _open, rawTarget) => {
    const target = rawTarget.trim().replace(/^<|>$/g, "");
    if (target.startsWith(`/${wikiSlug}/`)) return full;
    if (isRemoteUrl(target) || target.startsWith("#")) return full;

    const [cleanTarget, rawFragment] = splitTarget(target);
    const resolved = normalizePath(path.normalize(path.join(dir, cleanTarget)));
    const sourcePath = resolveSourcePath(cleanTarget, resolved);
    if (sourcePath) {
      if (!publicSourcePaths.has(sourcePath)) {
        return `${prefix}${label}`;
      }
      const fragment = rawFragment ? `#${rawFragment}` : "";
      return `${prefix}[${label}](${sourceRouteForPath(sourcePath)}${fragment})`;
    }

    if (cleanTarget.endsWith(".md")) {
      const key = pageLookup.get(pageKeyForPath(resolved)) || pageLookup.get(path.basename(resolved, ".md"));
      if (key) return `${prefix}[${label}](${pagePathForKey(key)})`;
    }

    return `${prefix}${label}`;
  });
}

function splitTarget(target) {
  const hashIndex = target.indexOf("#");
  if (hashIndex === -1) return [target, ""];
  return [target.slice(0, hashIndex), target.slice(hashIndex + 1)];
}

function resolveSourcePath(cleanTarget, resolved) {
  const normalizedTarget = normalizePath(cleanTarget);
  if (normalizedTarget.startsWith("sources/")) return normalizedTarget;
  const sourceIndex = resolved.indexOf("sources/");
  if (sourceIndex >= 0) return resolved.slice(sourceIndex);
  return null;
}

function stripObsidianCallouts(markdown) {
  return markdown.replace(/^>\s*\[!(\w+)\]\s*$/gm, (_match, label) => `> ${label.toUpperCase()}`);
}

function buildUnitMetadata(markdown) {
  const marker = markdown.match(/<!--\s*ibwiki:unit\s+({[\s\S]*?})\s*-->/);
  if (!marker) return null;
  try {
    const parsed = JSON.parse(marker[1]);
    return {
      subject: String(parsed.subject || "").trim(),
      unitId: String(parsed.unit_id || "").trim(),
      title: String(parsed.unit_title || "").trim(),
      subtitle: String(parsed.unit_subtitle || "").trim(),
      level: String(parsed.sl_hl || "").trim(),
    };
  } catch {
    return null;
  }
}

function buildUnitSnapshot(unit, markdown) {
  const tabs = extractUnitTabs(markdown);
  return {
    ...unit,
    tabs,
  };
}

function extractUnitTabs(markdown) {
  const tabs = [];
  const pattern = /<!--\s*ibwiki:tab\s+([\w-]+)\s*-->([\s\S]*?)<!--\s*\/ibwiki:tab\s*-->/g;
  for (const match of markdown.matchAll(pattern)) {
    const id = normalizeUnitTabId(match[1]);
    if (!id || id === "cross" || id === "cross-topic") continue;
    const label = unitTabLabel(id);
    const content = stripIbwikiMarkers(match[2]).trim();
    const contentWithoutHeading = content.replace(/^##\s+.+$/m, "").trim();
    const sections = splitMarkdownH3Sections(contentWithoutHeading);
    tabs.push({
      id,
      label,
      overviewHtml: renderUnitMarkdown(sections.overview),
      cards: sections.cards.map((card, index) => buildUnitCard(card, id, index)),
    });
  }
  return tabs;
}

function normalizeUnitTabId(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}

function unitTabLabel(id) {
  if (id === "concepts") return "Concepts";
  if (id === "problem-patterns") return "Problem patterns";
  return titleFromSlug(id);
}

function splitMarkdownH3Sections(markdown) {
  const lines = markdown.split("\n");
  const overview = [];
  const cards = [];
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      if (current) cards.push(current);
      current = {
        title: heading[1].trim(),
        body: [],
      };
      continue;
    }
    if (current) {
      current.body.push(line);
    } else {
      overview.push(line);
    }
  }
  if (current) cards.push(current);

  return {
    overview: overview.join("\n").trim(),
    cards,
  };
}

function buildUnitCard(card, tabId, index) {
  const body = card.body.join("\n").trim();
  const marker = body.match(/<!--\s*ibwiki:(?:kc|pattern)\s+({[\s\S]*?})\s*-->/);
  const metadata = parseMarkerJson(marker?.[1]);
  const title = String(metadata?.kc_title || metadata?.pattern_title || card.title || "").trim();
  const code =
    metadata?.kc_code !== undefined
      ? `KC ${metadata.kc_code}`
      : metadata?.pattern_code || (tabId === "problem-patterns" ? `P${index + 1}` : "");
  const level = String(metadata?.kc_sl_hl || metadata?.pattern_sl_hl || "").trim();
  const keywords = Array.isArray(metadata?.keywords)
    ? metadata.keywords.map((item) => String(item).trim()).filter(Boolean)
    : extractKeywords(body);
  const bodyWithoutKeywordLine = body.replace(/\*\*Keywords:\*\*\s*[^\n]+/i, "").trim();
  return {
    code: String(code || "").trim(),
    title: title || card.title,
    level,
    keywords,
    html: renderUnitMarkdown(bodyWithoutKeywordLine),
  };
}

function parseMarkerJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractKeywords(markdown) {
  const match = markdown.match(/\*\*Keywords:\*\*\s*([^\n]+)/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((item) => item.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

function renderUnitMarkdown(markdown) {
  const clean = stripIbwikiMarkers(markdown).trim();
  if (!clean) return "";
  return sanitizeHtml(md.render(clean), sanitizeOptions);
}

function stripIbwikiMarkers(markdown) {
  return markdown
    .replace(/<!--\s*ibwiki:[\s\S]*?-->/g, "")
    .replace(/<!--\s*\/ibwiki:[\s\S]*?-->/g, "");
}

function chunkPage(page) {
  const sections = splitIntoSections(page.text);
  const chunks = [];
  let sortOrder = 0;
  for (const section of sections) {
    const text = section.text.trim();
    if (text.length < 80) continue;
    for (const part of splitLongText(text, 1400)) {
      chunks.push({
        key: `${page.key}::${sortOrder}`,
        pageKey: page.key,
        pageTitle: page.title,
        headingPath: section.heading ? [page.title, section.heading] : [page.title],
        text: part,
        path: section.heading
          ? `${page.path}#${slugifyHeading(section.heading)}`
          : page.path,
        sortOrder,
      });
      sortOrder += 1;
    }
  }
  return chunks;
}

function splitIntoSections(text) {
  const lines = text.split("\n");
  const sections = [];
  let current = { heading: "", text: "" };

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      if (current.text.trim()) sections.push(current);
      current = { heading: heading[1].trim(), text: `${heading[1].trim()}\n` };
    } else {
      current.text += `${line}\n`;
    }
  }

  if (current.text.trim()) sections.push(current);
  return sections.length ? sections : [{ heading: "", text }];
}

function splitLongText(text, maxLength) {
  if (text.length <= maxLength) return [text];
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length > maxLength && current.trim()) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = `${current}\n\n${paragraph}`.trim();
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function markdownToText(markdown) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/^\s{0,3}[-*+]\s+/gm, "- ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "# ")
    .replace(/[*_~]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHeadings(markdown) {
  return [...markdown.matchAll(/^(#{1,4})\s+(.+)$/gm)].map((match) => ({
    depth: match[1].length,
    text: match[2].replace(/\s+#$/, "").trim(),
    id: slugifyHeading(match[2]),
  }));
}

function firstHeading(markdown) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function titleFromPath(relativePath) {
  if (relativePath === "index.md") return wikiTitle;
  return path
    .basename(relativePath, ".md")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleFromSlug(value) {
  return String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function makeExcerpt(text) {
  const compact = text.replace(/^#\s+.+$/m, "").replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function pageKeyForPath(relativePath) {
  if (relativePath === "index.md") return "index";
  return normalizePath(relativePath).replace(/^wiki\//, "").replace(/\.md$/, "");
}

function pagePathForKey(key) {
  return key === "index" ? `/${wikiSlug}` : `/${wikiSlug}/${key}`;
}

function sourceRouteForPath(sourcePath) {
  return `/${wikiSlug}/_source/${encodeURIPath(sourcePath)}`;
}

function pageTypeForKey(key) {
  if (key === "index") return "index";
  return key.split("/")[0] || "page";
}

function sourceKeyForPath(sourcePath) {
  return normalizePath(sourcePath).replace(/^sources\//, "").replace(/\.[^.]+$/, "");
}

function sourceTitleForPath(sourcePath) {
  return path.basename(sourcePath).replace(/\.[^.]+$/, "");
}

function sourceTypeForPath(sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".md") return "markdown";
  if (ext === ".txt") return "text";
  return "file";
}

function imageMimeTypeForPath(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function comparePagePaths(a, b) {
  if (a === "index.md") return -1;
  if (b === "index.md") return 1;
  return a.localeCompare(b);
}

function comparePages(a, b) {
  if (a.key === "index") return -1;
  if (b.key === "index") return 1;
  return a.title.localeCompare(b.title);
}

function slugifyHeading(value) {
  return String(value)
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function encodeURIPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isRemoteUrl(value) {
  return /^(https?:|mailto:)/i.test(value);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
