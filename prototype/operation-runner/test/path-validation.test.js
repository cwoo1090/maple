const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  EXTRACTOR_VERSION,
  IMPROVE_WIKI_ALLOWED_PATHS,
  IMPROVE_WIKI_FORBIDDEN_PATHS,
  ORGANIZE_SOURCES_ALLOWED_PATHS,
  ASSET_REGISTRY_PATH,
  SOURCE_MANIFEST_PATH,
  SOURCE_ARTIFACTS_PATH,
  WIKI_MANIFEST_PATH,
  WIKI_HEALTHCHECK_ALLOWED_PATHS,
  WIKI_WRITE_ALLOWED_PATHS,
  UPDATE_RULES_ALLOWED_PATHS,
  buildApplyChatPrompt,
  buildExploreChatPrompt,
  buildFastExploreChatPrompt,
  buildMaintenancePrompt,
  buildWikiPrompt,
  calculateFullSlideBudget,
  classifySourceMaterial,
  contactSheetRanges,
  collectExploreSourceVisualContext,
  collectReferencedWikiAssetImages,
  collectWikiPageImageAttachments,
  createSnapshot,
  diffSnapshot,
  fallbackSelectPageNumbers,
  getSourceReadiness,
  getSourceStatus,
  getWikiStatus,
  getOutsideWikiChanges,
  initializeWorkspace,
  isAllowedPath,
  isWikiContentPagePath,
  isRunnerMetadataPath,
  hasPendingGeneratedChanges,
  getReviewableChangedFiles,
  getUserVisibleChangedFiles,
  markSourcesIngested,
  markWikiTrusted,
  acceptOutsideWikiChanges,
  undoOutsideWikiChanges,
  migrateLegacyWorkspace,
  normalizeLegacyWorkspaceReferences,
  normalizeOperationId,
  normalizeMarkdownMathDelimiters,
  normalizeRelativePath,
  orderedSourcePathsForBuild,
  planBuildWikiSourceBatches,
  parseExplorePageReferences,
  parsePdfUseAsJson,
  parseSourcePathsJson,
  parseSlideSelectionJson,
  parseVisualInspectionPlanJson,
  readAssetRegistry,
  readLatestPreparedSourceText,
  readRenderedPdfResult,
  findLatestExtractedSourceForChat,
  normalizeConvertedMarkdownAssets,
  resolveSourceArtifact,
  validatePreparedOutputDir,
  validatePreparedSourceArtifact,
  renderReportMarkdown,
  renderPreparedSourcesForPrompt,
  renderSourceStatusForPrompt,
  loadAskWikiKeywordIndex,
  prepareFastExploreChatContext,
  retrieveAskWikiIndexChunks,
  resolveOperationId,
  selectBuildWikiVisualInputs,
  selectSourcePathsForBuild,
  sourcePathsForBuild,
  collectAlwaysCheckSourcePaths,
  extractAlwaysCheckSourcePathsFromSchema,
  autoRegisterReferencedWikiAssets,
  validateAndRestoreProtectedAssets,
  validateAndRestoreChanges,
  workspaceAgentInstructions,
  writeSourceManifest,
  writeSourceArtifactsRegistry,
  writeWikiManifest,
  undoLastOperation,
  wikiSchemaTemplate,
  parseArgs,
} = require("../src/operation-runner");

test("operation report makes a timeout explicit even when the provider exits zero", () => {
  const markdown = renderReportMarkdown({
    id: "timeout-report",
    type: "build-wiki",
    status: "timed_out",
    provider: "codex",
    model: "gpt-5.5",
    reasoningEffort: "xhigh",
    startedAt: "2026-07-15T13:14:09.749Z",
    completedAt: "2026-07-15T13:44:10.552Z",
    codex: {
      exitCode: 0,
      signal: null,
      timedOut: true,
      cancelled: false,
    },
    snapshot: { path: ".aiwiki/snapshots/timeout-report" },
    changedFiles: [],
    userVisibleChangedFiles: [],
    reviewableChangedFiles: [],
    allowedPathRules: [],
  });

  assert.match(markdown, /Provider outcome: timed out/);
  assert.match(markdown, /Provider exit code: 0/);
  assert.doesNotMatch(markdown, /Codex exit code/);
});

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

test("parseArgs preserves empty flag values", () => {
  const parsed = parseArgs([
    "explore-chat",
    "/tmp/workspace",
    "--question",
    "What is this workspace?",
    "--selected-path",
    "",
    "--history-json",
    "[]",
  ]);

  assert.equal(parsed.flags["selected-path"], "");
  assert.equal(parsed.flags["history-json"], "[]");
});

test("Build Wiki content detection accepts any non-asset wiki markdown page", () => {
  assert.equal(isWikiContentPagePath("wiki/concepts/memory.md"), true);
  assert.equal(isWikiContentPagePath("wiki/summaries/lecture-01.md"), true);
  assert.equal(isWikiContentPagePath("wiki/guides/study-path.md"), true);
  assert.equal(isWikiContentPagePath("wiki/units/chemistry/classification-of-matter.md"), true);
  assert.equal(isWikiContentPagePath("wiki/problems/chemistry/patterns.md"), true);
  assert.equal(isWikiContentPagePath("wiki/assets/README.md"), false);
  assert.equal(isWikiContentPagePath("wiki/assets/diagram.png"), false);
  assert.equal(isWikiContentPagePath("index.md"), false);
  assert.equal(isWikiContentPagePath("schema.md"), false);
  assert.equal(isWikiContentPagePath("../wiki/units/escape.md"), false);
});

test("normalizes safe relative paths", () => {
  assert.equal(normalizeRelativePath("wiki/concepts/memory.md"), "wiki/concepts/memory.md");
  assert.equal(normalizeRelativePath("./wiki/../index.md"), "index.md");
});

test("normalizes legacy chat and broken-link vocabulary", () => {
  assert.equal(
    normalizeLegacyWorkspaceReferences(
      "study-chat .studywiki/chat/run/report.json studywiki-broken://raw/a.md raw/a.md",
    ),
    "explore-chat .aiwiki/chat/run/report.json aiwiki-broken://sources/a.md sources/a.md",
  );
});

test("normalizes and resolves provided operation ids", () => {
  assert.equal(normalizeOperationId(" op-1 "), "op-1");
  assert.equal(normalizeOperationId("../op"), "");
  assert.equal(resolveOperationId("provided.apply_1"), "provided.apply_1");
  assert.match(resolveOperationId(""), /^\d{8}T\d{6}Z-[a-f0-9]{6}$/);
  assert.throws(
    () => resolveOperationId("../bad"),
    /Invalid --operation-id/,
  );
});

test("rejects path traversal and absolute paths", () => {
  assert.equal(normalizeRelativePath("../sources/source.md"), null);
  assert.equal(normalizeRelativePath("/tmp/source.md"), null);
});

test("allows Build Wiki write targets", () => {
  assert.equal(isAllowedPath("wiki/summaries/sample.md"), true);
  assert.equal(isAllowedPath("wiki/assets/sample/figure.png"), true);
  assert.equal(isAllowedPath("index.md"), true);
  assert.equal(isAllowedPath("log.md"), true);
  assert.equal(isAllowedPath("schema.md"), true);
  assert.equal(isAllowedPath("AGENTS.md"), true);
  assert.equal(isAllowedPath("CLAUDE.md"), true);
  assert.equal(isAllowedPath(".aiwiki/extracted/sample.json"), true);
});

test("allows source move targets during Build Wiki", () => {
  assert.equal(isAllowedPath("sources/sample-note.md"), true);
  assert.equal(isAllowedPath("sources/new-source.md"), true);
});

test("extracts always-check source paths only from the dedicated schema section", () => {
  const schema = `
## Source Citations

- Example only: \`sources/example.md\`

## Core Curriculum Sources

- Always treat \`sources/_core/syllabus.docx\` as canonical.
- Always treat \`sources/_core/key-concepts.docx\` as canonical.

## Page Types

- Not a required source: \`sources/not-required.md\`
`;

  assert.deepEqual(extractAlwaysCheckSourcePathsFromSchema(schema), [
    "sources/_core/key-concepts.docx",
    "sources/_core/syllabus.docx",
  ]);
});

test("Build Wiki source selection includes schema-required sources", () => {
  const sourceStatus = {
    files: [
      { path: "sources/new.md", state: "new" },
      { path: "sources/_core/syllabus.docx", state: "unchanged" },
      { path: "sources/_core/key-concepts.docx", state: "unchanged" },
    ],
  };

  assert.deepEqual(sourcePathsForBuild(sourceStatus, {
    requiredSourcePaths: [
      "sources/_core/syllabus.docx",
      "sources/_core/key-concepts.docx",
    ],
  }), [
    "sources/_core/key-concepts.docx",
    "sources/_core/syllabus.docx",
    "sources/new.md",
  ]);
});

test("selected Build Wiki source paths include schema-required sources", () => {
  const sourceStatus = {
    files: [
      { path: "sources/selected.md", state: "unchanged" },
      { path: "sources/_core/syllabus.docx", state: "unchanged" },
    ],
  };

  assert.deepEqual(selectSourcePathsForBuild(sourceStatus, {
    sourcePaths: ["sources/selected.md"],
    requiredSourcePaths: ["sources/_core/syllabus.docx"],
  }), [
    "sources/selected.md",
    "sources/_core/syllabus.docx",
  ]);
});

test("collects always-check source paths that exist in the workspace", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-required-sources-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources", "_core"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "_core", "syllabus.docx"), "source\n");
  await fs.writeFile(path.join(workspace, "schema.md"), `
## Core Curriculum Sources

- Always treat \`sources/_core/syllabus.docx\` as canonical.
- Always treat \`sources/_core/missing.docx\` as canonical.
`);

  assert.deepEqual(await collectAlwaysCheckSourcePaths(workspace), [
    "sources/_core/syllabus.docx",
  ]);
});

test("Build Wiki restores source content edits", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-build-source-guard-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");

  const snapshot = await createSnapshot(workspace, "test-op");
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "changed\n");

  const changes = await diffSnapshot(workspace, snapshot);
  const validated = await validateAndRestoreChanges(workspace, snapshot, changes);
  const sourceChange = validated.find((change) => change.path === "sources/a.md");

  assert.equal(sourceChange?.allowed, false);
  assert.equal(sourceChange?.restored, true);
  assert.equal(await fs.readFile(path.join(workspace, "sources", "a.md"), "utf8"), "alpha\n");
});

test("Build Wiki allows move-only source renames with unchanged hashes", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-build-source-move-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");

  const snapshot = await createSnapshot(workspace, "test-op");
  await fs.mkdir(path.join(workspace, "sources", "week-1"), { recursive: true });
  await fs.rename(
    path.join(workspace, "sources", "a.md"),
    path.join(workspace, "sources", "week-1", "a.md"),
  );

  const changes = await diffSnapshot(workspace, snapshot);
  const validated = await validateAndRestoreChanges(workspace, snapshot, changes);

  assert.equal(validated.every((change) => change.allowed), true);
  assert.equal(validated.some((change) => change.restored), false);
  assert.equal(
    await fs.readFile(path.join(workspace, "sources", "week-1", "a.md"), "utf8"),
    "alpha\n",
  );
});

test("restores provider edits to the source manifest", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-provider-manifest-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, ".aiwiki"), { recursive: true });
  await fs.writeFile(
    path.join(workspace, SOURCE_MANIFEST_PATH),
    JSON.stringify({ schemaVersion: 1, operationId: "before", files: [] }, null, 2),
  );

  const snapshot = await createSnapshot(workspace, "op");
  await fs.writeFile(
    path.join(workspace, SOURCE_MANIFEST_PATH),
    JSON.stringify({ schemaVersion: 1, operationId: "provider-edit", files: [] }, null, 2),
  );

  const changes = await diffSnapshot(workspace, snapshot);
  const validated = await validateAndRestoreChanges(workspace, snapshot, changes);
  const manifestChange = validated.find((change) => change.path === SOURCE_MANIFEST_PATH);

  assert.equal(manifestChange?.allowed, false);
  assert.equal(manifestChange?.restored, true);
  assert.match(await fs.readFile(path.join(workspace, SOURCE_MANIFEST_PATH), "utf8"), /"before"/);
});

test("source readiness recovers stale preparing records", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-stale-source-prep-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const sourcePath = "sources/sample.pdf";
  const sourceBody = Buffer.from("%PDF-1.4\nstale test\n");
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, sourcePath), sourceBody);

  await writeSourceArtifactsRegistry(workspace, {
    sources: {
      [sourcePath]: {
        sourcePath,
        sourceSlug: "sample",
        sourceFormat: "pdf",
        status: "preparing",
        operationId: "prepare-stale",
        startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        sourceSha256: crypto.createHash("sha256").update(sourceBody).digest("hex"),
        sourceSize: sourceBody.length,
        sourceMtimeMs: 1,
        extractorVersion: EXTRACTOR_VERSION,
      },
    },
  });

  const readiness = await getSourceReadiness(workspace);
  const file = readiness.files.find((entry) => entry.path === sourcePath);

  assert.equal(file?.status, "not-prepared");
  assert.equal(file?.health?.reason, "stale-preparation");
  assert.match(file?.error ?? "", /did not finish/i);
});

test("uses per-operation allowlists", () => {
  assert.equal(isAllowedPath("wiki/concepts/a.md", WIKI_HEALTHCHECK_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("schema.md", WIKI_HEALTHCHECK_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("AGENTS.md", WIKI_HEALTHCHECK_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("CLAUDE.md", WIKI_HEALTHCHECK_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("sources/source.md", WIKI_HEALTHCHECK_ALLOWED_PATHS), false);

  assert.equal(isAllowedPath("wiki/concepts/a.md", WIKI_WRITE_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("schema.md", WIKI_WRITE_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("AGENTS.md", WIKI_WRITE_ALLOWED_PATHS), false);
  assert.equal(isAllowedPath("CLAUDE.md", WIKI_WRITE_ALLOWED_PATHS), false);
  assert.equal(isAllowedPath("sources/source.md", WIKI_WRITE_ALLOWED_PATHS), false);

  assert.equal(isAllowedPath("wiki/concepts/a.md", IMPROVE_WIKI_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("schema.md", IMPROVE_WIKI_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("AGENTS.md", IMPROVE_WIKI_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("CLAUDE.md", IMPROVE_WIKI_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("sources/source.md", IMPROVE_WIKI_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("tools/wiki_lint.py", IMPROVE_WIKI_ALLOWED_PATHS), false);
  assert.equal(isAllowedPath("sources/source.md", IMPROVE_WIKI_FORBIDDEN_PATHS), false);

  assert.equal(isAllowedPath("sources/source.md", ORGANIZE_SOURCES_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("wiki/summaries/a.md", ORGANIZE_SOURCES_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("schema.md", ORGANIZE_SOURCES_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("AGENTS.md", ORGANIZE_SOURCES_ALLOWED_PATHS), false);

  assert.equal(isAllowedPath("schema.md", UPDATE_RULES_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("AGENTS.md", UPDATE_RULES_ALLOWED_PATHS), true);
  assert.equal(isAllowedPath("wiki/concepts/a.md", UPDATE_RULES_ALLOWED_PATHS), false);
});

test("Improve Wiki restores source edits while allowing rule files", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-improve-rules-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "source.md"), "original source\n");
  await fs.writeFile(path.join(workspace, "schema.md"), "# Schema\n");
  await fs.writeFile(path.join(workspace, "AGENTS.md"), "# Agents\n");

  const snapshot = await createSnapshot(workspace, "op-improve-rules");
  await fs.writeFile(path.join(workspace, "sources", "source.md"), "edited source\n");
  await fs.writeFile(path.join(workspace, "schema.md"), "# Schema\n\nClickable source links.\n");
  await fs.writeFile(path.join(workspace, "AGENTS.md"), "# Agents\n\nFollow schema.\n");
  await fs.writeFile(path.join(workspace, "CLAUDE.md"), "# Claude\n\nFollow schema.\n");

  const changes = await diffSnapshot(workspace, snapshot);
  const validated = await validateAndRestoreChanges(
    workspace,
    snapshot,
    changes,
    IMPROVE_WIKI_ALLOWED_PATHS,
    {
      sourceMoveOnly: true,
      forbiddenPathRules: IMPROVE_WIKI_FORBIDDEN_PATHS,
    },
  );

  const byPath = new Map(validated.map((change) => [change.path, change]));
  assert.equal(byPath.get("sources/source.md")?.allowed, false);
  assert.equal(byPath.get("sources/source.md")?.restored, true);
  assert.equal(byPath.get("schema.md")?.allowed, true);
  assert.equal(byPath.get("AGENTS.md")?.allowed, true);
  assert.equal(byPath.get("CLAUDE.md")?.allowed, true);
  assert.equal(await fs.readFile(path.join(workspace, "sources", "source.md"), "utf8"), "original source\n");
  assert.match(await fs.readFile(path.join(workspace, "CLAUDE.md"), "utf8"), /Follow schema/);
});

test("Improve Wiki allows move-only source renames with unchanged hashes", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-improve-source-move-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");

  const snapshot = await createSnapshot(workspace, "op-improve-source-move");
  await fs.mkdir(path.join(workspace, "sources", "week-1"), { recursive: true });
  await fs.rename(
    path.join(workspace, "sources", "a.md"),
    path.join(workspace, "sources", "week-1", "a.md"),
  );

  const changes = await diffSnapshot(workspace, snapshot);
  const validated = await validateAndRestoreChanges(
    workspace,
    snapshot,
    changes,
    IMPROVE_WIKI_ALLOWED_PATHS,
    { sourceMoveOnly: true },
  );

  assert.equal(validated.every((change) => change.allowed), true);
  assert.equal(validated.some((change) => change.restored), false);
  assert.equal(
    await fs.readFile(path.join(workspace, "sources", "week-1", "a.md"), "utf8"),
    "alpha\n",
  );
});

test("identifies runner-owned metadata paths", () => {
  assert.equal(isRunnerMetadataPath(".aiwiki/snapshots/123/tree/index.md"), true);
  assert.equal(isRunnerMetadataPath(".aiwiki/operations/123/report.json"), true);
  assert.equal(isRunnerMetadataPath(".aiwiki/changed/last-operation.json"), true);
  assert.equal(isRunnerMetadataPath(".aiwiki/cache/extracted/source/manifest.json"), true);
  assert.equal(isRunnerMetadataPath(".aiwiki/extracted/sample.json"), true);
  assert.equal(isRunnerMetadataPath(SOURCE_ARTIFACTS_PATH), true);
});

test("classifies textbook-like Markdown as markdown-primary with on-demand visuals", () => {
  const classification = classifySourceMaterial(
    "sources/1. Classification of Matter.pdf",
    [
      "# The particulate nature of matter",
      "",
      "## LEARNING OBJECTIVES",
      "In this chapter you will understand elements, compounds, and mixtures.",
      "",
      "## GUIDING QUESTIONS",
      "How can matter be classified?",
      "",
      "## KEY POINT",
      "Elements are primary constituents of matter.",
      "",
    ].join("\n"),
    { pageCount: 1 },
  );

  assert.equal(classification.materialType, "textbook");
  assert.equal(classification.textPolicy, "markdown-primary");
  assert.equal(classification.visualPolicy, "on-demand");
});

test("normalizes converted Markdown images with parentheses in source paths", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-md-assets-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const converterOutput = path.join(workspace, "converter-output");
  const outputDir = path.join(workspace, "extracted-output");
  const artifactDir = path.join(converterOutput, "1. Atomic structure (QS)_artifacts");
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  const imagePath = path.join(artifactDir, "image_000001.png");
  await fs.writeFile(imagePath, "image-bytes");
  const markdownPath = path.join(converterOutput, "text.md");
  await fs.writeFile(
    markdownPath,
    [
      "# Converted",
      "",
      `![Image](${imagePath})`,
      "before\0after",
      "",
    ].join("\n"),
  );

  const normalized = await normalizeConvertedMarkdownAssets(markdownPath, outputDir);
  assert.match(normalized, /!\[Image]\(<artifacts\/image_000001\.png>\)/);
  assert.doesNotMatch(normalized, /maple-md-assets/);
  assert.doesNotMatch(normalized, /\0/);
  assert.equal(
    await fs.readFile(path.join(outputDir, "artifacts", "image_000001.png"), "utf8"),
    "image-bytes",
  );
});

test("Build Wiki attaches inline Markdown figures for learning material", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-inline-figures-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const sourceRoot = path.join(workspace, ".aiwiki", "extracted", "latest", "textbook");
  const artifactsRoot = path.join(sourceRoot, "artifacts");
  await fs.mkdir(artifactsRoot, { recursive: true });
  await fs.writeFile(path.join(artifactsRoot, "diagram.png"), "diagram-bytes");
  await fs.writeFile(
    path.join(sourceRoot, "text.md"),
    [
      "# Atomic Structure",
      "",
      "The diagram shows particles in the atom.",
      "",
      "![Diagram](<artifacts/diagram.png>)",
      "",
    ].join("\n"),
  );

  const preparedSources = {
    sources: [{
      sourcePath: "sources/textbook.pdf",
      sourceSlug: "textbook",
      sourceFormat: "pdf",
      textPath: ".aiwiki/extracted/latest/textbook/text.md",
      pageImages: ["unused/page-01.png"],
      promptPageImages: ["unused/page-01.jpg"],
      contactSheets: [],
      pageCount: 12,
      materialType: "textbook",
      textPolicy: "markdown-primary",
      visualPolicy: "on-demand",
      pdfUseAs: "text-with-diagrams",
      selectedPromptImages: [],
    }],
    imageAttachments: [],
    visualInput: {},
  };

  await selectBuildWikiVisualInputs(
    workspace,
    {
      name: "codex",
      supportsImageAttachments: true,
      supportsImagePathReferences: false,
    },
    {
      operationId: "op",
      operationDir: path.join(workspace, ".aiwiki", "operations", "op"),
      dryRun: true,
    },
    preparedSources,
  );

  assert.deepEqual(preparedSources.imageAttachments, [
    path.join(artifactsRoot, "diagram.png"),
  ]);
  assert.equal(preparedSources.sources[0].inlineMarkdownFigures.length, 1);
  assert.equal(preparedSources.sources[0].pagesToInspect, undefined);
  assert.equal(preparedSources.visualInput.inlineMarkdownFigureCount, 1);
  assert.equal(preparedSources.visualInput.selectedFullSlideCount, 0);

  const prompt = await buildWikiPrompt(
    workspace,
    {
      sourceStatus: {
        files: [{ path: "sources/textbook.pdf", state: "new" }],
      },
    },
    preparedSources,
  );
  assert.match(prompt, /Inline Markdown figures inspected as image attachments/);
  assert.match(prompt, /artifacts\/diagram\.png/);
  assert.match(prompt, /copy the listed figure PNG into wiki\/assets/);
  assert.match(prompt, /Never embed \.aiwiki paths directly/);
  assert.match(prompt, /Prefer 1-3 high-value images per substantial wiki page/);
});

test("Build Wiki keeps useful inline figures when mostly-text source is detected as diagram-heavy", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-mostly-text-diagrams-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const sourceRoot = path.join(workspace, ".aiwiki", "extracted", "latest", "worksheet");
  const artifactsRoot = path.join(sourceRoot, "artifacts");
  await fs.mkdir(artifactsRoot, { recursive: true });
  await fs.writeFile(path.join(artifactsRoot, "heating-curve.png"), "diagram-bytes");
  await fs.writeFile(
    path.join(sourceRoot, "text.md"),
    [
      "# Heating Curves",
      "",
      "A plateau shows a change of state.",
      "",
      "![Heating curve](<artifacts/heating-curve.png>)",
      "",
    ].join("\n"),
  );

  const preparedSources = {
    sources: [{
      sourcePath: "sources/worksheet.pdf",
      sourceSlug: "worksheet",
      sourceFormat: "pdf",
      textPath: ".aiwiki/extracted/latest/worksheet/text.md",
      pageImages: ["unused/page-01.png"],
      promptPageImages: ["unused/page-01.jpg"],
      contactSheets: [],
      pageCount: 6,
      materialType: "worksheet",
      textPolicy: "markdown-and-visual",
      visualPolicy: "selected-pages",
      pdfUseAs: "mostly-text",
      detectedUseAs: "text-with-diagrams",
      selectedPromptImages: [],
    }],
    imageAttachments: [],
    visualInput: {},
  };

  await selectBuildWikiVisualInputs(
    workspace,
    {
      name: "codex",
      supportsImageAttachments: true,
      supportsImagePathReferences: false,
    },
    {
      operationId: "op",
      operationDir: path.join(workspace, ".aiwiki", "operations", "op"),
      dryRun: true,
    },
    preparedSources,
  );

  assert.deepEqual(preparedSources.imageAttachments, [
    path.join(artifactsRoot, "heating-curve.png"),
  ]);
  assert.equal(preparedSources.sources[0].inlineMarkdownFigures.length, 1);
  assert.equal(preparedSources.visualInput.inlineMarkdownFigureCount, 1);
});

test("Build Wiki lists cropped inline figures even after the image attachment budget is exhausted", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-inline-budget-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  async function writeFigureSource(slug, figureCount) {
    const sourceRoot = path.join(workspace, ".aiwiki", "extracted", "latest", slug);
    const artifactsRoot = path.join(sourceRoot, "artifacts");
    await fs.mkdir(artifactsRoot, { recursive: true });
    const lines = [`# ${slug}`];
    for (let index = 1; index <= figureCount; index += 1) {
      const fileName = `figure-${index}.png`;
      await fs.writeFile(path.join(artifactsRoot, fileName), `figure-${index}`);
      lines.push("", `## Figure ${index}`, `![Figure ${index}](<artifacts/${fileName}>)`);
    }
    await fs.writeFile(path.join(sourceRoot, "text.md"), `${lines.join("\n")}\n`);
  }

  await writeFigureSource("atomic", 8);
  await writeFigureSource("classification", 8);
  await writeFigureSource("s1-1", 10);

  const preparedSources = {
    sources: [
      {
        sourcePath: "sources/atomic.pdf",
        sourceSlug: "atomic",
        sourceFormat: "pdf",
        textPath: ".aiwiki/extracted/latest/atomic/text.md",
        pageImages: [],
        promptPageImages: [],
        contactSheets: [],
        pageCount: 8,
        materialType: "worksheet",
        textPolicy: "markdown-and-visual",
        visualPolicy: "selected-pages",
        pdfUseAs: "text-with-diagrams",
      },
      {
        sourcePath: "sources/classification.pdf",
        sourceSlug: "classification",
        sourceFormat: "pdf",
        textPath: ".aiwiki/extracted/latest/classification/text.md",
        pageImages: [],
        promptPageImages: [],
        contactSheets: [],
        pageCount: 8,
        materialType: "worksheet",
        textPolicy: "markdown-and-visual",
        visualPolicy: "selected-pages",
        pdfUseAs: "text-with-diagrams",
      },
      {
        sourcePath: "sources/S1.1.pdf",
        sourceSlug: "s1-1",
        sourceFormat: "pdf",
        textPath: ".aiwiki/extracted/latest/s1-1/text.md",
        pageImages: [".aiwiki/extracted/latest/s1-1/pages/page-01.png"],
        promptPageImages: [".aiwiki/extracted/latest/s1-1/prompt-images/page-01.jpg"],
        contactSheets: [],
        pageCount: 1,
        materialType: "worksheet",
        textPolicy: "markdown-and-visual",
        visualPolicy: "selected-pages",
        pdfUseAs: "text-with-diagrams",
      },
    ],
    imageAttachments: [],
    visualInput: {},
  };

  await selectBuildWikiVisualInputs(
    workspace,
    {
      name: "codex",
      supportsImageAttachments: true,
      supportsImagePathReferences: false,
    },
    {
      operationId: "op",
      operationDir: path.join(workspace, ".aiwiki", "operations", "op"),
      dryRun: true,
    },
    preparedSources,
  );

  const s11 = preparedSources.sources[2];
  assert.equal(preparedSources.visualInput.inlineMarkdownFigureCount, 16);
  assert.equal(preparedSources.imageAttachments.length, 17);
  assert.equal(s11.inlineMarkdownFigures.length, 10);
  assert.equal(s11.inlineMarkdownFigureAttachmentCount, 0);
  assert.equal(s11.pagesToInspect.length, 1);
  assert.equal(s11.assetCandidates.length, 0);

  const prompt = await buildWikiPrompt(
    workspace,
    {
      sourceStatus: {
        files: [
          { path: "sources/atomic.pdf", state: "new" },
          { path: "sources/classification.pdf", state: "new" },
          { path: "sources/S1.1.pdf", state: "new" },
        ],
      },
    },
    preparedSources,
  );
  const s11Prompt = prompt.slice(prompt.indexOf("- sources/S1.1.pdf"));
  assert.match(s11Prompt, /Inline Markdown figures selected for inspection but not attached/);
  assert.match(s11Prompt, /\.aiwiki\/extracted\/latest\/s1-1\/artifacts\/figure-1\.png/);
  assert.match(s11Prompt, /\.aiwiki\/extracted\/latest\/s1-1\/artifacts\/figure-10\.png/);
  assert.match(s11Prompt, /Pages inspected as image attachments/);
  assert.match(s11Prompt, /rendered page images are inspection context only/);
  assert.match(s11Prompt, /full PNG: \.aiwiki\/extracted\/latest\/s1-1\/pages\/page-01\.png/);
  assert.doesNotMatch(s11Prompt, /Fallback wiki image candidate full-resolution page PNGs/);
});

test("Build Wiki keeps detected mostly-visual PDFs on page visual planning", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-mostly-visual-pages-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const sourceRoot = path.join(workspace, ".aiwiki", "extracted", "latest", "slides");
  const artifactsRoot = path.join(sourceRoot, "artifacts");
  await fs.mkdir(artifactsRoot, { recursive: true });
  await fs.writeFile(path.join(artifactsRoot, "decorative.png"), "image-bytes");
  await fs.writeFile(
    path.join(sourceRoot, "text.md"),
    [
      "# Slide Deck",
      "",
      "![Decorative](<artifacts/decorative.png>)",
      "",
    ].join("\n"),
  );

  const preparedSources = {
    sources: [{
      sourcePath: "sources/slides.pdf",
      sourceSlug: "slides",
      sourceFormat: "pdf",
      textPath: ".aiwiki/extracted/latest/slides/text.md",
      pageImages: [".aiwiki/extracted/latest/slides/pages/page-01.png"],
      promptPageImages: [".aiwiki/extracted/latest/slides/prompt-images/page-01.jpg"],
      contactSheets: [],
      pageCount: 1,
      materialType: "worksheet",
      textPolicy: "markdown-and-visual",
      visualPolicy: "selected-pages",
      pdfUseAs: "text-with-diagrams",
      detectedUseAs: "mostly-visual",
    }],
    imageAttachments: [],
    visualInput: {},
  };

  await selectBuildWikiVisualInputs(
    workspace,
    {
      name: "codex",
      supportsImageAttachments: true,
      supportsImagePathReferences: false,
    },
    {
      operationId: "op",
      operationDir: path.join(workspace, ".aiwiki", "operations", "op"),
      dryRun: true,
    },
    preparedSources,
  );

  assert.equal(preparedSources.sources[0].inlineMarkdownFigures, undefined);
  assert.equal(preparedSources.sources[0].pagesToInspect.length, 1);
  assert.deepEqual(preparedSources.imageAttachments, [
    path.join(workspace, ".aiwiki/extracted/latest/slides/prompt-images/page-01.jpg"),
  ]);

  const prompt = await buildWikiPrompt(
    workspace,
    {
      sourceStatus: {
        files: [{ path: "sources/slides.pdf", state: "new" }],
      },
    },
    preparedSources,
  );
  assert.match(prompt, /For mostly-visual PDFs, read prepared Markdown first as an orientation\/outline layer/);
  assert.match(prompt, /rendered page images as the authoritative representation/);
  assert.match(prompt, /Prepared Markdown orientation\/outline: \.aiwiki\/extracted\/latest\/slides\/text\.md/);
  assert.doesNotMatch(prompt, /For PDF and Office-derived sources, read the prepared structured Markdown first/);
});

test("source artifact registry resolves only current source hashes", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-artifacts-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".aiwiki", "extracted", "latest", "foo"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "foo.pdf"), "pdf-v1");
  await fs.writeFile(path.join(workspace, ".aiwiki", "extracted", "latest", "foo", "text.md"), "# Foo\n");
  await fs.writeFile(
    path.join(workspace, ".aiwiki", "extracted", "latest", "foo", "manifest.json"),
    `${JSON.stringify({ pageCount: 1, textPath: "text.md" }, null, 2)}\n`,
  );

  const sourceSha256 = crypto.createHash("sha256").update("pdf-v1").digest("hex");
  await writeSourceArtifactsRegistry(workspace, {
    sources: {
      "sources/foo.pdf": {
        sourcePath: "sources/foo.pdf",
        sourceSlug: "foo",
        sourceSha256,
        extractorVersion: EXTRACTOR_VERSION,
        structuredMarkdown: ".aiwiki/extracted/latest/foo/text.md",
        manifestPath: ".aiwiki/extracted/latest/foo/manifest.json",
        latestPath: ".aiwiki/extracted/latest/foo",
      },
    },
  });

  const current = await resolveSourceArtifact(workspace, "sources/foo.pdf");
  assert.equal(current.structuredMarkdown, ".aiwiki/extracted/latest/foo/text.md");

  await fs.writeFile(path.join(workspace, "sources", "foo.pdf"), "pdf-v2");
  assert.equal(await resolveSourceArtifact(workspace, "sources/foo.pdf"), null);

  const stale = await resolveSourceArtifact(workspace, "sources/foo.pdf", { allowStale: true });
  assert.equal(stale.structuredMarkdown, ".aiwiki/extracted/latest/foo/text.md");
});

test("prepared source health rejects broken Markdown artifacts", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-health-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const latestDir = path.join(workspace, ".aiwiki", "extracted", "latest", "foo");
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.mkdir(latestDir, { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "foo.pdf"), "pdf-v1");
  await fs.writeFile(
    path.join(latestDir, "manifest.json"),
    `${JSON.stringify({ pageCount: 1, textPath: "text.md" }, null, 2)}\n`,
  );
  await fs.writeFile(path.join(latestDir, "text.md"), "# Foo\n![Missing](<artifacts/missing.png>)\n");

  const sourceSha256 = crypto.createHash("sha256").update("pdf-v1").digest("hex");
  const entry = {
    sourcePath: "sources/foo.pdf",
    sourceSlug: "foo",
    sourceSha256,
    status: "ready",
    extractorVersion: EXTRACTOR_VERSION,
    structuredMarkdown: ".aiwiki/extracted/latest/foo/text.md",
    manifestPath: ".aiwiki/extracted/latest/foo/manifest.json",
    latestPath: ".aiwiki/extracted/latest/foo",
  };
  await writeSourceArtifactsRegistry(workspace, {
    sources: {
      "sources/foo.pdf": entry,
    },
  });

  let health = await validatePreparedSourceArtifact(workspace, entry);
  assert.equal(health.ok, false);
  assert.equal(health.reason, "missing-image-file");
  assert.equal(await resolveSourceArtifact(workspace, "sources/foo.pdf"), null);

  let readiness = await getSourceReadiness(workspace);
  let pdf = readiness.files.find((file) => file.path === "sources/foo.pdf");
  assert.equal(pdf.status, "not-prepared");
  assert.equal(pdf.health.reason, "missing-image-file");
  assert.equal(pdf.preparedPath, null);

  await fs.writeFile(path.join(latestDir, "text.md"), Buffer.from("# Foo\nbefore\0after\n", "utf8"));
  health = await validatePreparedSourceArtifact(workspace, entry);
  assert.equal(health.ok, false);
  assert.equal(health.reason, "nul-byte-in-markdown");

  await fs.writeFile(path.join(latestDir, "text.md"), "# Foo\n![Image](/var/folders/tmp/maple-docling-x/image.png)\n");
  health = await validatePreparedSourceArtifact(workspace, entry);
  assert.equal(health.ok, false);
  assert.equal(health.reason, "unstable-image-path");

  await writeSourceArtifactsRegistry(workspace, {
    sources: {
      "sources/foo.pdf": {
        ...entry,
        extractorVersion: EXTRACTOR_VERSION - 1,
      },
    },
  });
  await fs.writeFile(path.join(latestDir, "text.md"), "# Foo\n");
  readiness = await getSourceReadiness(workspace);
  pdf = readiness.files.find((file) => file.path === "sources/foo.pdf");
  assert.equal(pdf.status, "not-prepared");
  assert.equal(pdf.health.reason, "stale-extractor-version");
});

test("prepared output health accepts normalized Markdown image artifacts", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-output-health-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const outputDir = path.join(workspace, ".aiwiki", "cache", "extracted", "abc");
  await fs.mkdir(path.join(outputDir, "artifacts"), { recursive: true });
  await fs.writeFile(path.join(outputDir, "artifacts", "diagram (1).png"), "image");
  await fs.writeFile(
    path.join(outputDir, "text.md"),
    "# Foo\n![Diagram](<artifacts/diagram (1).png>)\n",
  );
  await fs.writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify({ pageCount: 1, textPath: "text.md" }, null, 2)}\n`,
  );

  const health = await validatePreparedOutputDir(workspace, outputDir, {
    sourcePath: "sources/foo.pdf",
  });
  assert.equal(health.ok, true);
  assert.equal(health.imageCount, 1);
});

test("stale latest source artifacts are not used as legacy extraction fallback", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-stale-latest-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const latestDir = path.join(workspace, ".aiwiki", "extracted", "latest", "foo");
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.mkdir(path.join(latestDir, "pages"), { recursive: true });
  await fs.mkdir(path.join(latestDir, "prompt-images"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "foo.pdf"), "pdf-v1");
  await fs.writeFile(path.join(latestDir, "text.md"), "OLD EXTRACTED TEXT SHOULD NOT BE USED\n");
  await fs.writeFile(path.join(latestDir, "pages", "page-01.png"), "png");
  await fs.writeFile(path.join(latestDir, "prompt-images", "page-01.jpg"), "jpg");
  await fs.writeFile(
    path.join(latestDir, "manifest.json"),
    `${JSON.stringify({
      pageCount: 1,
      textPath: "text.md",
      pages: [{ page: 1, image: "pages/page-01.png", promptImage: "prompt-images/page-01.jpg" }],
    }, null, 2)}\n`,
  );

  const sourceSha256 = crypto.createHash("sha256").update("pdf-v1").digest("hex");
  await writeSourceArtifactsRegistry(workspace, {
    sources: {
      "sources/foo.pdf": {
        sourcePath: "sources/foo.pdf",
        sourceSlug: "foo",
        sourceSha256,
        extractorVersion: EXTRACTOR_VERSION,
        structuredMarkdown: ".aiwiki/extracted/latest/foo/text.md",
        manifestPath: ".aiwiki/extracted/latest/foo/manifest.json",
        latestPath: ".aiwiki/extracted/latest/foo",
      },
    },
  });

  await fs.writeFile(path.join(workspace, "sources", "foo.pdf"), "pdf-v2");

  assert.equal(await readLatestPreparedSourceText(workspace, "sources/foo.pdf", 1000), null);
  assert.equal(await findLatestExtractedSourceForChat(workspace, "sources/foo.pdf"), null);
});

test("parses PDF use-as role overrides for PDF source paths only", () => {
  assert.deepEqual(
    parsePdfUseAsJson(JSON.stringify({
      "sources/notes.pdf": "mostly-text",
      "sources/diagrams.pdf": "text-with-diagrams",
      "sources/slides.pdf": "mostly-visual",
    })),
    {
      "sources/notes.pdf": "mostly-text",
      "sources/diagrams.pdf": "text-with-diagrams",
      "sources/slides.pdf": "mostly-visual",
    },
  );
  assert.throws(
    () => parsePdfUseAsJson(JSON.stringify({ "sources/notes.md": "mostly-text" })),
    /must target PDF source paths/,
  );
  assert.throws(
    () => parsePdfUseAsJson(JSON.stringify({ "sources/notes.pdf": "worksheet" })),
    /Invalid PDF use-as role/,
  );
});

test("source readiness reports current registry state and ignores stale hashes", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-readiness-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".aiwiki", "extracted", "latest", "foo"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "foo.pdf"), "pdf-v1");
  await fs.writeFile(path.join(workspace, "sources", "notes.md"), "# Notes\n");
  await fs.writeFile(path.join(workspace, ".aiwiki", "extracted", "latest", "foo", "text.md"), "# Foo\n");
  await fs.writeFile(
    path.join(workspace, ".aiwiki", "extracted", "latest", "foo", "manifest.json"),
    `${JSON.stringify({ pageCount: 1, textPath: "text.md" }, null, 2)}\n`,
  );

  const sourceSha256 = crypto.createHash("sha256").update("pdf-v1").digest("hex");
  await writeSourceArtifactsRegistry(workspace, {
    sources: {
      "sources/foo.pdf": {
        sourcePath: "sources/foo.pdf",
        sourceSlug: "foo",
        sourceSha256,
        status: "ready",
        extractorVersion: EXTRACTOR_VERSION,
        useAs: "text-with-diagrams",
        detectedUseAs: "text-with-diagrams",
        structuredMarkdown: ".aiwiki/extracted/latest/foo/text.md",
        manifestPath: ".aiwiki/extracted/latest/foo/manifest.json",
        latestPath: ".aiwiki/extracted/latest/foo",
      },
    },
  });

  let readiness = await getSourceReadiness(workspace);
  const readyPdf = readiness.files.find((file) => file.path === "sources/foo.pdf");
  assert.equal(readyPdf.status, "ready");
  assert.equal(readyPdf.useAs, "text-with-diagrams");
  assert.equal(readyPdf.preparedPath, ".aiwiki/extracted/latest/foo/text.md");
  assert.equal(readiness.files.find((file) => file.path === "sources/notes.md")?.status, "ready");

  await fs.writeFile(path.join(workspace, "sources", "foo.pdf"), "pdf-v2");
  readiness = await getSourceReadiness(workspace);
  const stalePdf = readiness.files.find((file) => file.path === "sources/foo.pdf");
  assert.equal(stalePdf.status, "not-prepared");
  assert.equal(stalePdf.preparedPath, null);
});

test("source path selector preserves requested subset for source preparation", () => {
  const sourceStatus = {
    files: [
      { path: "sources/a.md", state: "new" },
      { path: "sources/b.md", state: "modified" },
      { path: "sources/old.md", state: "removed" },
    ],
  };

  assert.deepEqual(
    selectSourcePathsForBuild(sourceStatus, { sourcePaths: ["sources/b.md"] }),
    ["sources/b.md"],
  );
  assert.throws(
    () => selectSourcePathsForBuild(sourceStatus, { sourcePaths: ["sources/old.md"] }),
    /not available/,
  );
});

test("Build Wiki source ordering preserves requested incremental sources", () => {
  const sourceStatus = {
    files: [
      { path: "sources/a.md", state: "new" },
      { path: "sources/b.md", state: "modified" },
      { path: "sources/c.md", state: "unchanged" },
      { path: "sources/old.md", state: "removed" },
    ],
  };

  assert.deepEqual(
    orderedSourcePathsForBuild(sourceStatus, { sourcePaths: ["sources/b.md"] }),
    ["sources/b.md"],
  );
  assert.deepEqual(
    orderedSourcePathsForBuild(sourceStatus),
    ["sources/a.md", "sources/b.md"],
  );
  assert.deepEqual(
    orderedSourcePathsForBuild(sourceStatus, { force: true }),
    ["sources/a.md", "sources/b.md", "sources/c.md"],
  );
  assert.throws(
    () => orderedSourcePathsForBuild(sourceStatus, { sourcePaths: ["sources/old.md"] }),
    /not available/,
  );
});

test("Build Wiki batch planner preserves source order and contiguous batches", () => {
  const sourcePaths = [
    "sources/ch01.pdf",
    "sources/ch02.pdf",
    "sources/notes.md",
    "sources/ch03.pdf",
  ];
  const preparedSources = {
    sources: [
      { sourcePath: "sources/ch01.pdf", sourceFormat: "pdf", pageCount: 60 },
      { sourcePath: "sources/ch02.pdf", sourceFormat: "pdf", pageCount: 60 },
      { sourcePath: "sources/notes.md", sourceFormat: "md", pageCount: 0 },
      { sourcePath: "sources/ch03.pdf", sourceFormat: "pdf", pageCount: 60 },
    ],
  };
  const sourceStatus = {
    files: sourcePaths.map((path) => ({ path, size: path.endsWith(".pdf") ? 8_000_000 : 20_000 })),
  };

  const plan = planBuildWikiSourceBatches(sourcePaths, preparedSources, sourceStatus);

  assert.equal(plan.enabled, true);
  assert.deepEqual(plan.orderedSourcePaths, sourcePaths);
  assert.deepEqual(
    plan.batches.flatMap((batch) => batch.sourcePaths),
    sourcePaths,
  );
  for (const batch of plan.batches) {
    const firstIndex = sourcePaths.indexOf(batch.sourcePaths[0]);
    assert.deepEqual(
      batch.sourcePaths,
      sourcePaths.slice(firstIndex, firstIndex + batch.sourcePaths.length),
    );
  }
});

test("Build Wiki prompt scopes selected sources and renders PDF role guidance", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-selected-build-prompt-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const sourceStatus = {
    files: [
      { path: "sources/qs.pdf", state: "new" },
      { path: "sources/skip.pdf", state: "new" },
    ],
  };
  const prompt = await buildWikiPrompt(
    workspace,
    {
      sourceStatus,
      sourcePaths: ["sources/qs.pdf"],
      buildSourcePaths: ["sources/qs.pdf"],
    },
    {
      sources: [{
        sourcePath: "sources/qs.pdf",
        sourceFormat: "pdf",
        textPath: ".aiwiki/extracted/op/qs/text.md",
        pdfUseAs: "text-with-diagrams",
        detectedUseAs: "mostly-text",
      }],
    },
  );

  assert.match(prompt, /sources\/qs\.pdf/);
  assert.doesNotMatch(prompt, /sources\/skip\.pdf/);
  assert.match(prompt, /PDF reading mode: text-with-diagrams/);
  assert.match(prompt, /important extracted figures/);
});

test("reviews root files while excluding sources, metadata, assets, and deleted paths", () => {
  const changes = [
    {
      path: "wiki/concepts/old-topic.md",
      status: "deleted",
      allowed: true,
      restored: false,
    },
    {
      path: "wiki/concepts/new-folder/old-topic.md",
      status: "added",
      allowed: true,
      restored: false,
    },
    {
      path: "wiki/assets/diagram.png",
      status: "added",
      allowed: true,
      restored: false,
    },
    {
      path: "index.md",
      status: "modified",
      allowed: true,
      restored: false,
    },
    {
      path: "log.md",
      status: "modified",
      allowed: true,
      restored: false,
    },
    {
      path: "schema.md",
      status: "modified",
      allowed: true,
      restored: false,
    },
    {
      path: "AGENTS.md",
      status: "modified",
      allowed: true,
      restored: false,
    },
    {
      path: "CLAUDE.md",
      status: "added",
      allowed: true,
      restored: false,
    },
    {
      path: "README.md",
      status: "modified",
      allowed: true,
      restored: false,
    },
    {
      path: "sources/source.md",
      status: "modified",
      allowed: true,
      restored: false,
    },
    {
      path: ".aiwiki/operations/op/report.json",
      status: "added",
      allowed: true,
      restored: false,
    },
  ];

  const userVisible = getUserVisibleChangedFiles(changes);
  assert.deepEqual(
    userVisible.map((change) => change.path),
    [
      "wiki/concepts/old-topic.md",
      "wiki/concepts/new-folder/old-topic.md",
      "index.md",
      "log.md",
      "schema.md",
      "AGENTS.md",
      "CLAUDE.md",
      "README.md",
    ],
  );

  assert.deepEqual(
    getReviewableChangedFiles(userVisible).map((change) => change.path),
    [
      "wiki/concepts/new-folder/old-topic.md",
      "index.md",
      "log.md",
      "schema.md",
      "AGENTS.md",
      "CLAUDE.md",
      "README.md",
    ],
  );
});

test("does not block source baseline for non-reviewable changed markers", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-pending-review-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  await initializeWorkspace(workspace);
  await fs.mkdir(path.join(workspace, ".aiwiki", "changed"), { recursive: true });
  await fs.writeFile(
    path.join(workspace, ".aiwiki", "changed", "last-operation.json"),
    `${JSON.stringify(
      {
        operationId: "op-review",
        operationType: "build-wiki",
        status: "completed",
        changedFiles: [
          { path: "sources/source.md", status: "modified", allowed: true, restored: false },
          { path: "wiki/assets/diagram.png", status: "added", allowed: true, restored: false },
        ],
      },
      null,
      2,
    )}\n`,
  );

  assert.equal(await hasPendingGeneratedChanges(workspace), false);
  await markSourcesIngested(workspace);
});

test("blocks source baseline while content changes need review", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-content-review-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  await initializeWorkspace(workspace);
  await fs.mkdir(path.join(workspace, ".aiwiki", "changed"), { recursive: true });
  await fs.writeFile(
    path.join(workspace, ".aiwiki", "changed", "last-operation.json"),
    `${JSON.stringify(
      {
        operationId: "op-review",
        operationType: "build-wiki",
        status: "completed",
        changedFiles: [
          { path: "index.md", status: "modified", allowed: true, restored: false },
          { path: "wiki/concepts/new-topic.md", status: "added", allowed: true, restored: false },
        ],
      },
      null,
      2,
    )}\n`,
  );

  assert.equal(await hasPendingGeneratedChanges(workspace), true);
  await assert.rejects(
    () => markSourcesIngested(workspace),
    /Finish reviewing or undo generated changes/,
  );

  await fs.writeFile(
    path.join(workspace, ".aiwiki", "changed", "last-operation.json"),
    `${JSON.stringify(
      {
        operationId: "op-review",
        operationType: "build-wiki",
        status: "completed",
        reviewedAt: new Date().toISOString(),
        changedFiles: [],
      },
      null,
      2,
    )}\n`,
  );

  assert.equal(await hasPendingGeneratedChanges(workspace), false);
});

test("calculates balanced full-slide visual budget", () => {
  assert.equal(calculateFullSlideBudget(5), 5);
  assert.equal(calculateFullSlideBudget(10), 3);
  assert.equal(calculateFullSlideBudget(21), 5);
  assert.equal(calculateFullSlideBudget(50), 10);
});

test("splits contact sheet ranges into 20-page chunks", () => {
  assert.deepEqual(contactSheetRanges(20), [{ startPage: 1, endPage: 20 }]);
  assert.deepEqual(contactSheetRanges(21), [
    { startPage: 1, endPage: 20 },
    { startPage: 21, endPage: 21 },
  ]);
  assert.deepEqual(contactSheetRanges(50), [
    { startPage: 1, endPage: 20 },
    { startPage: 21, endPage: 40 },
    { startPage: 41, endPage: 50 },
  ]);
});

test("fallback slide selection spreads pages and includes the last page", () => {
  assert.deepEqual(fallbackSelectPageNumbers(21, 5), [1, 6, 11, 16, 21]);
  assert.deepEqual(fallbackSelectPageNumbers(3, 10), [1, 2, 3]);
});

test("parses strict and fenced AI slide selection JSON", () => {
  assert.deepEqual(parseSlideSelectionJson('{"selectedPages":[{"page":9,"reason":"diagram"}]}'), [
    { page: 9, reason: "diagram" },
  ]);
  assert.deepEqual(
    parseSlideSelectionJson("```json\n{\"selectedPages\":[17]}\n```"),
    [{ page: 17, reason: "" }],
  );
  assert.throws(() => parseSlideSelectionJson("not json"), /Unexpected token|not valid JSON/);
});

test("parses and normalizes visual inspection planning JSON", () => {
  const plan = parseVisualInspectionPlanJson(
    JSON.stringify({
      materialType: "Worked Solution",
      inspectionPolicy: "Inspect Most",
      pagesToInspect: [
        { page: 3, reason: "derivation" },
        { page: 3, reason: "duplicate" },
        { page: 99, reason: "invalid" },
        { page: 1, reason: "overview" },
      ],
      assetCandidates: [
        { page: 3, reason: "key equation" },
        { page: 4, reason: "not inspected" },
      ],
      notes: "Use derivation pages.",
    }),
    5,
  );

  assert.equal(plan.materialType, "worked-solution");
  assert.equal(plan.inspectionPolicy, "inspect-most");
  assert.deepEqual(plan.pagesToInspect, [
    { page: 1, reason: "overview" },
    { page: 3, reason: "derivation" },
  ]);
  assert.deepEqual(plan.assetCandidates, [{ page: 3, reason: "key equation" }]);
  assert.match(plan.notes, /derivation/);
});

test("prepared source prompt lists only selected slide attachments", () => {
  const text = renderPreparedSourcesForPrompt({
    sources: [
      {
        sourcePath: "sources/deck.pptx",
        textPath: ".aiwiki/extracted/op/deck/text.md",
        contactSheetPath: ".aiwiki/extracted/op/deck/prompt-images/contact-sheet.jpg",
        pageImages: [
          ".aiwiki/extracted/op/deck/pages/page-01.png",
          ".aiwiki/extracted/op/deck/pages/page-02.png",
          ".aiwiki/extracted/op/deck/pages/page-03.png",
        ],
        selectedPromptImages: [
          {
            page: 2,
            promptImage: ".aiwiki/extracted/op/deck/prompt-images/page-02.jpg",
            fullImage: ".aiwiki/extracted/op/deck/pages/page-02.png",
            reason: "key diagram",
          },
        ],
      },
    ],
  });

  assert.match(text, /contact-sheet\.jpg/);
  assert.match(text, /prompt-images\/page-02\.jpg/);
  assert.match(text, /pages\/page-02\.png/);
  assert.doesNotMatch(text, /pages\/page-01\.png/);
  assert.doesNotMatch(text, /pages\/page-03\.png/);
});

test("reads chunked and legacy contact sheet manifests", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "maple-rendered-manifest-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const chunkedDir = path.join(root, "chunked");
  await fs.mkdir(path.join(chunkedDir, "pages"), { recursive: true });
  await fs.mkdir(path.join(chunkedDir, "prompt-images"), { recursive: true });
  await fs.writeFile(path.join(chunkedDir, "pages", "page-01.png"), "png");
  await fs.writeFile(path.join(chunkedDir, "prompt-images", "page-01.jpg"), "jpg");
  await fs.writeFile(path.join(chunkedDir, "prompt-images", "contact-sheet-01.jpg"), "sheet1");
  await fs.writeFile(path.join(chunkedDir, "prompt-images", "contact-sheet-02.jpg"), "sheet2");
  await fs.writeFile(
    path.join(chunkedDir, "manifest.json"),
    `${JSON.stringify({
      contactSheet: "prompt-images/contact-sheet-01.jpg",
      contactSheets: [
        { path: "prompt-images/contact-sheet-01.jpg", startPage: 1, endPage: 20 },
        { path: "prompt-images/contact-sheet-02.jpg", startPage: 21, endPage: 40 },
      ],
      pageCount: 40,
      pages: [{ page: 1, image: "pages/page-01.png", promptImage: "prompt-images/page-01.jpg" }],
      textPath: "text.md",
    }, null, 2)}\n`,
  );
  await fs.writeFile(path.join(chunkedDir, "text.md"), "text");

  const chunked = await readRenderedPdfResult(chunkedDir);
  assert.equal(chunked.contactSheets.length, 2);
  assert.equal(path.basename(chunked.contactSheetPath), "contact-sheet-01.jpg");
  assert.deepEqual(
    chunked.contactSheets.map((sheet) => [sheet.startPage, sheet.endPage]),
    [[1, 20], [21, 40]],
  );

  const legacyDir = path.join(root, "legacy");
  await fs.mkdir(path.join(legacyDir, "pages"), { recursive: true });
  await fs.mkdir(path.join(legacyDir, "prompt-images"), { recursive: true });
  await fs.writeFile(path.join(legacyDir, "pages", "page-01.png"), "png");
  await fs.writeFile(path.join(legacyDir, "prompt-images", "page-01.jpg"), "jpg");
  await fs.writeFile(path.join(legacyDir, "prompt-images", "contact-sheet.jpg"), "sheet");
  await fs.writeFile(
    path.join(legacyDir, "manifest.json"),
    `${JSON.stringify({
      contactSheet: "prompt-images/contact-sheet.jpg",
      pageCount: 1,
      pages: [{ page: 1, image: "pages/page-01.png", promptImage: "prompt-images/page-01.jpg" }],
      textPath: "text.md",
    }, null, 2)}\n`,
  );
  await fs.writeFile(path.join(legacyDir, "text.md"), "text");

  const legacy = await readRenderedPdfResult(legacyDir);
  assert.equal(legacy.contactSheets.length, 1);
  assert.equal(path.basename(legacy.contactSheetPath), "contact-sheet.jpg");
});

test("Codex visual planning fallback attaches only pagesToInspect images", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-codex-visual-plan-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const deckDir = path.join(workspace, ".aiwiki", "extracted", "op", "deck");
  await fs.mkdir(path.join(deckDir, "pages"), { recursive: true });
  await fs.mkdir(path.join(deckDir, "prompt-images"), { recursive: true });
  const pageImages = [];
  const promptPageImages = [];
  for (let page = 1; page <= 10; page += 1) {
    const pageName = String(page).padStart(2, "0");
    const pageImage = `.aiwiki/extracted/op/deck/pages/page-${pageName}.png`;
    const promptImage = `.aiwiki/extracted/op/deck/prompt-images/page-${pageName}.jpg`;
    await fs.writeFile(path.join(workspace, pageImage), `png-${page}`);
    await fs.writeFile(path.join(workspace, promptImage), `jpg-${page}`);
    pageImages.push(pageImage);
    promptPageImages.push(promptImage);
  }
  await fs.writeFile(path.join(deckDir, "prompt-images", "contact-sheet-01.jpg"), "sheet1");
  await fs.writeFile(path.join(deckDir, "prompt-images", "contact-sheet-02.jpg"), "sheet2");
  const preparedSources = {
    sources: [{
      sourcePath: "sources/deck.pdf",
      sourceSlug: "deck",
      textPath: "",
      pageImages,
      promptPageImages,
      contactSheetPath: ".aiwiki/extracted/op/deck/prompt-images/contact-sheet-01.jpg",
      contactSheets: [
        {
          path: ".aiwiki/extracted/op/deck/prompt-images/contact-sheet-01.jpg",
          startPage: 1,
          endPage: 5,
        },
        {
          path: ".aiwiki/extracted/op/deck/prompt-images/contact-sheet-02.jpg",
          startPage: 6,
          endPage: 10,
        },
      ],
      selectedPromptImages: [],
      pageCount: 10,
    }],
    imageAttachments: [],
    visualInput: null,
  };

  await selectBuildWikiVisualInputs(
    workspace,
    { name: "codex", supportsImageAttachments: true, defaultModel: "test" },
    { dryRun: true, operationId: "op", operationDir: path.join(workspace, ".aiwiki", "operations", "op") },
    preparedSources,
  );

  assert.deepEqual(
    preparedSources.sources[0].pagesToInspect.map((entry) => entry.page),
    [1, 6, 10],
  );
  assert.deepEqual(
    preparedSources.imageAttachments.map((filePath) => path.basename(filePath)),
    ["page-01.jpg", "page-06.jpg", "page-10.jpg"],
  );
  assert.equal(preparedSources.visualInput.contactSheetCount, 2);
  assert.equal(preparedSources.visualInput.visionInputCount, 3);
  assert.equal(preparedSources.visualInput.sources[0].visualInspectionMode, "attached-images");
  assert.equal(preparedSources.visualInput.sources[0].inspectionPolicy, "fallback");
});

test("Claude visual planning records transparent fallback without image attachments", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-claude-visual-plan-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const deckDir = path.join(workspace, ".aiwiki", "extracted", "op", "deck");
  await fs.mkdir(path.join(deckDir, "pages"), { recursive: true });
  await fs.mkdir(path.join(deckDir, "prompt-images"), { recursive: true });
  const pageImages = [];
  const promptPageImages = [];
  for (let page = 1; page <= 8; page += 1) {
    const pageName = String(page).padStart(2, "0");
    const pageImage = `.aiwiki/extracted/op/deck/pages/page-${pageName}.png`;
    const promptImage = `.aiwiki/extracted/op/deck/prompt-images/page-${pageName}.jpg`;
    await fs.writeFile(path.join(workspace, pageImage), `png-${page}`);
    await fs.writeFile(path.join(workspace, promptImage), `jpg-${page}`);
    pageImages.push(pageImage);
    promptPageImages.push(promptImage);
  }
  await fs.writeFile(path.join(deckDir, "prompt-images", "contact-sheet-01.jpg"), "sheet");
  const preparedSources = {
    sources: [{
      sourcePath: "sources/deck.pdf",
      sourceSlug: "deck",
      textPath: "",
      pageImages,
      promptPageImages,
      contactSheetPath: ".aiwiki/extracted/op/deck/prompt-images/contact-sheet-01.jpg",
      contactSheets: [{
        path: ".aiwiki/extracted/op/deck/prompt-images/contact-sheet-01.jpg",
        startPage: 1,
        endPage: 8,
      }],
      selectedPromptImages: [],
      pageCount: 8,
    }],
    imageAttachments: [],
    visualInput: null,
  };

  await selectBuildWikiVisualInputs(
    workspace,
    { name: "claude", supportsImageAttachments: false, defaultModel: "test" },
    { dryRun: false, operationId: "op", operationDir: path.join(workspace, ".aiwiki", "operations", "op") },
    preparedSources,
  );

  assert.deepEqual(preparedSources.imageAttachments, []);
  assert.equal(
    preparedSources.visualInput.sources[0].visualInspectionMode,
    "provider-image-unsupported-fallback",
  );
  assert.equal(preparedSources.visualInput.visionInputCount, 0);
  assert.equal(preparedSources.visualInput.sources[0].visionInputCount, 0);
});

test("path-referenced visual planning uses absolute image paths without attachments", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-path-visual-plan-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const deckDir = path.join(workspace, ".aiwiki", "extracted", "op", "deck");
  await fs.mkdir(path.join(deckDir, "pages"), { recursive: true });
  await fs.mkdir(path.join(deckDir, "prompt-images"), { recursive: true });
  const pageImages = [];
  const promptPageImages = [];
  for (let page = 1; page <= 3; page += 1) {
    const pageName = String(page).padStart(2, "0");
    const pageImage = `.aiwiki/extracted/op/deck/pages/page-${pageName}.png`;
    const promptImage = `.aiwiki/extracted/op/deck/prompt-images/page-${pageName}.jpg`;
    await fs.writeFile(path.join(workspace, pageImage), `png-${page}`);
    await fs.writeFile(path.join(workspace, promptImage), `jpg-${page}`);
    pageImages.push(pageImage);
    promptPageImages.push(promptImage);
  }
  await fs.writeFile(path.join(deckDir, "prompt-images", "contact-sheet-01.jpg"), "sheet");
  const preparedSources = {
    sources: [{
      sourcePath: "sources/deck.pdf",
      sourceSlug: "deck",
      textPath: "",
      pageImages,
      promptPageImages,
      contactSheetPath: ".aiwiki/extracted/op/deck/prompt-images/contact-sheet-01.jpg",
      contactSheets: [{
        path: ".aiwiki/extracted/op/deck/prompt-images/contact-sheet-01.jpg",
        startPage: 1,
        endPage: 3,
      }],
      selectedPromptImages: [],
      pageCount: 3,
    }],
    imageAttachments: [],
    visualInput: null,
  };

  await selectBuildWikiVisualInputs(
    workspace,
    {
      name: "claude",
      supportsImageAttachments: false,
      supportsImagePathReferences: true,
      defaultModel: "test",
    },
    { dryRun: false, operationId: "op", operationDir: path.join(workspace, ".aiwiki", "operations", "op") },
    preparedSources,
  );

  assert.deepEqual(preparedSources.imageAttachments, []);
  assert.equal(preparedSources.visualInput.providerSupportsImageAttachments, false);
  assert.equal(preparedSources.visualInput.providerSupportsImagePathReferences, true);
  assert.equal(preparedSources.visualInput.imageAttachmentCount, 0);
  assert.equal(preparedSources.visualInput.visionInputCount, 3);
  assert.equal(preparedSources.visualInput.pathReferencedImageCount, 3);
  assert.equal(preparedSources.visualInput.sources[0].visualInspectionMode, "path-referenced-images");
  assert.equal(preparedSources.visualInput.sources[0].visionInputCount, 3);
  assert.equal(preparedSources.visualInput.sources[0].pathReferencedImageCount, 3);

  const firstImagePath = path.join(workspace, promptPageImages[0]);
  assert.equal(preparedSources.sources[0].pagesToInspect[0].imageInputPath, firstImagePath);

  const promptText = renderPreparedSourcesForPrompt(preparedSources);
  assert.match(promptText, /Pages inspected through path-referenced images/);
  assert.match(promptText, new RegExp(firstImagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("normalizes escaped math delimiters outside fenced code", () => {
  const markdown = [
    "- \\(-\\omega_r L_s i_{qs}^{r}\\) appears in the d-axis voltage.",
    "",
    "\\[",
    "v_q = R_s i_q + \\omega_r\\phi_f",
    "\\]",
    "",
    "```md",
    "\\(keep this literal\\)",
    "```",
  ].join("\n");

  assert.equal(
    normalizeMarkdownMathDelimiters(markdown),
    [
      "- $-\\omega_r L_s i_{qs}^{r}$ appears in the d-axis voltage.",
      "",
      "$$",
      "v_q = R_s i_q + \\omega_r\\phi_f",
      "$$",
      "",
      "```md",
      "\\(keep this literal\\)",
      "```",
    ].join("\n"),
  );
});

test("keeps escaped math delimiter examples inside inline code", () => {
  const markdown = [
    "- Do not use escaped LaTeX delimiters like `\\(...\\)` or `\\[...\\]` in wiki pages.",
    "- Prefer \\(x^2\\) in prose only when it should render as math.",
  ].join("\n");

  assert.equal(
    normalizeMarkdownMathDelimiters(markdown),
    [
      "- Do not use escaped LaTeX delimiters like `\\(...\\)` or `\\[...\\]` in wiki pages.",
      "- Prefer $x^2$ in prose only when it should render as math.",
    ].join("\n"),
  );
});

test("preserves list indentation when normalizing escaped display math", () => {
  const markdown = [
    "- 뒤쪽의 normalized view는 대략",
    "  \\[",
    "  C \\approx \\frac{\\tau}{\\sqrt{P_{heat}}\\sqrt{J_{out}}}",
    "  \\]",
    "  형태로 정리합니다.",
  ].join("\n");

  assert.equal(
    normalizeMarkdownMathDelimiters(markdown),
    [
      "- 뒤쪽의 normalized view는 대략",
      "  $$",
      "  C \\approx \\frac{\\tau}{\\sqrt{P_{heat}}\\sqrt{J_{out}}}",
      "  $$",
      "  형태로 정리합니다.",
    ].join("\n"),
  );
});

test("wraps standalone bare LaTeX formula blocks", () => {
  const markdown = [
    "The normalized view is approximately:",
    "",
    "C \\approx \\frac{\\tau}",
    "{\\sqrt{P_{heat}}\\sqrt{J_{out}}}",
    "",
    "This means output inertia is small.",
  ].join("\n");

  assert.equal(
    normalizeMarkdownMathDelimiters(markdown),
    [
      "The normalized view is approximately:",
      "",
      "$$",
      "C \\approx \\frac{\\tau}",
      "{\\sqrt{P_{heat}}\\sqrt{J_{out}}}",
      "$$",
      "",
      "This means output inertia is small.",
    ].join("\n"),
  );
});

test("does not wrap prose that mentions LaTeX commands", () => {
  const markdown = [
    "Use \\tau for torque in the equation.",
    "Then compare the result with the prior section.",
  ].join("\n");

  assert.equal(normalizeMarkdownMathDelimiters(markdown), markdown);
});

test("wraps a bare LaTeX prefix without swallowing Korean prose", () => {
  const markdown =
    "C \\approx \\frac{\\tau}{\\sqrt{P_{heat}}\\sqrt{J_{out}}} 형태로 정리합니다.";

  assert.equal(
    normalizeMarkdownMathDelimiters(markdown),
    "$C \\approx \\frac{\\tau}{\\sqrt{P_{heat}}\\sqrt{J_{out}}}$ 형태로 정리합니다.",
  );
});

test("tracks source status from source manifest", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-status-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");

  let status = await getSourceStatus(workspace);
  assert.equal(status.manifestExists, false);
  assert.equal(status.pendingCount, 1);
  assert.equal(status.files.find((file) => file.path === "sources/a.md")?.state, "new");

  await writeSourceManifest(workspace, "test-op");
  status = await getSourceStatus(workspace);
  assert.equal(status.manifestExists, true);
  assert.equal(status.pendingCount, 0);
  assert.equal(status.files.find((file) => file.path === "sources/a.md")?.state, "unchanged");

  await fs.writeFile(path.join(workspace, "sources", "a.md"), "changed\n");
  status = await getSourceStatus(workspace);
  assert.equal(status.files.find((file) => file.path === "sources/a.md")?.state, "modified");

  await fs.rm(path.join(workspace, "sources", "a.md"));
  status = await getSourceStatus(workspace);
  assert.equal(status.files.find((file) => file.path === "sources/a.md")?.state, "removed");
});

test("tracks outside wiki changes from trusted wiki manifest", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-wiki-status-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await initializeWorkspace(workspace);
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A\n");

  await writeWikiManifest(workspace, "wiki-base");
  let status = await getWikiStatus(workspace);
  assert.equal(status.manifestExists, true);
  assert.equal(status.changedCount, 0);

  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A changed\n");
  await fs.writeFile(path.join(workspace, "wiki", "summaries", "b.md"), "# B\n");
  await fs.rm(path.join(workspace, "schema.md"));

  status = await getWikiStatus(workspace);
  assert.equal(status.changedCount, 3);
  assert.equal(status.changedFiles.find((file) => file.path === "wiki/concepts/a.md")?.state, "modified");
  assert.equal(status.changedFiles.find((file) => file.path === "wiki/summaries/b.md")?.state, "added");
  assert.equal(status.changedFiles.find((file) => file.path === "schema.md")?.state, "deleted");
});

test("accepting outside wiki changes does not clear pending sources", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-wiki-accept-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await initializeWorkspace(workspace);
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A\n");
  await writeWikiManifest(workspace, "wiki-base");

  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A changed\n");
  assert.equal((await getWikiStatus(workspace)).changedCount, 1);
  assert.equal((await getSourceStatus(workspace)).pendingCount, 1);

  const originalLog = console.log;
  console.log = () => {};
  t.after(() => {
    console.log = originalLog;
  });
  await acceptOutsideWikiChanges(workspace);

  assert.equal((await getWikiStatus(workspace)).changedCount, 0);
  assert.equal((await getSourceStatus(workspace)).pendingCount, 1);
});

test("Maple-trusted wiki save clears outside wiki change status", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-wiki-trusted-save-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await initializeWorkspace(workspace);
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A\n");
  await writeWikiManifest(workspace, "wiki-base");

  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A saved in Maple\n");
  assert.equal((await getWikiStatus(workspace)).changedCount, 1);

  const originalLog = console.log;
  console.log = () => {};
  t.after(() => {
    console.log = originalLog;
  });
  await markWikiTrusted(workspace, { source: "maple-manual-edit" });

  assert.equal((await getWikiStatus(workspace)).changedCount, 0);
});

test("undoing outside wiki changes restores trusted baseline files", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-wiki-undo-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await initializeWorkspace(workspace);
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A\n");
  await writeWikiManifest(workspace, "wiki-base");

  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A changed\n");
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "b.md"), "# B\n");
  await fs.rm(path.join(workspace, "schema.md"));

  const originalLog = console.log;
  console.log = () => {};
  t.after(() => {
    console.log = originalLog;
  });
  await undoOutsideWikiChanges(workspace);

  assert.equal(await fs.readFile(path.join(workspace, "wiki", "concepts", "a.md"), "utf8"), "# A\n");
  assert.equal(await pathExists(path.join(workspace, "wiki", "concepts", "b.md")), false);
  assert.equal(await pathExists(path.join(workspace, "schema.md")), true);
  assert.equal((await getWikiStatus(workspace)).changedCount, 0);
});

test("outside wiki changes are suppressed while Maple generated changes need review", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-wiki-review-suppress-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await initializeWorkspace(workspace);
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A\n");
  await writeWikiManifest(workspace, "wiki-base");
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A changed\n");

  const status = await getWikiStatus(workspace);
  assert.equal(status.changedCount, 1);
  assert.equal(getOutsideWikiChanges(status, null)?.changedCount, 1);
  assert.equal(
    getOutsideWikiChanges(status, {
      operationId: "op-review",
      changedFiles: [
        { path: "wiki/concepts/a.md", status: "modified", allowed: true, restored: false },
      ],
    }),
    null,
  );
});

test("treats source renames with unchanged content as already ingested", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-rename-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");
  await writeSourceManifest(workspace, "test-op");

  await fs.rename(path.join(workspace, "sources", "a.md"), path.join(workspace, "sources", "renamed.md"));

  const status = await getSourceStatus(workspace);
  assert.equal(status.pendingCount, 0);
  assert.equal(status.files.find((file) => file.path === "sources/renamed.md")?.state, "unchanged");
  assert.equal(status.files.find((file) => file.path === "sources/a.md"), undefined);
  assert.deepEqual(sourcePathsForBuild(status), []);
  assert.deepEqual(sourcePathsForBuild(status, { force: true }), ["sources/renamed.md"]);
  assert.match(renderSourceStatusForPrompt(status), /No pending source changes/);
});

test("treats source moves into folders with unchanged content as already ingested", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-folder-move-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");
  await writeSourceManifest(workspace, "test-op");

  await fs.mkdir(path.join(workspace, "sources", "week-1"), { recursive: true });
  await fs.rename(path.join(workspace, "sources", "a.md"), path.join(workspace, "sources", "week-1", "a.md"));

  const status = await getSourceStatus(workspace);
  assert.equal(status.pendingCount, 0);
  assert.equal(status.files.find((file) => file.path === "sources/week-1/a.md")?.state, "unchanged");
  assert.equal(status.files.find((file) => file.path === "sources/a.md"), undefined);
  assert.deepEqual(sourcePathsForBuild(status), []);
  assert.deepEqual(sourcePathsForBuild(status, { force: true }), ["sources/week-1/a.md"]);
});

test("tracks source move plus content edit as pending source content changes", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-move-edit-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");
  await writeSourceManifest(workspace, "test-op");

  await fs.mkdir(path.join(workspace, "sources", "week-1"), { recursive: true });
  await fs.rename(path.join(workspace, "sources", "a.md"), path.join(workspace, "sources", "week-1", "a.md"));
  await fs.writeFile(path.join(workspace, "sources", "week-1", "a.md"), "changed\n");

  const status = await getSourceStatus(workspace);
  assert.equal(status.pendingCount, 2);
  assert.equal(status.files.find((file) => file.path === "sources/week-1/a.md")?.state, "new");
  assert.equal(status.files.find((file) => file.path === "sources/a.md")?.state, "removed");
  assert.deepEqual(sourcePathsForBuild(status), ["sources/week-1/a.md"]);
});

test("matches duplicate source-content moves by count", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-duplicate-move-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "same\n");
  await fs.writeFile(path.join(workspace, "sources", "b.md"), "same\n");
  await writeSourceManifest(workspace, "test-op");

  await fs.mkdir(path.join(workspace, "sources", "organized"), { recursive: true });
  await fs.rename(path.join(workspace, "sources", "a.md"), path.join(workspace, "sources", "organized", "a.md"));
  await fs.rename(path.join(workspace, "sources", "b.md"), path.join(workspace, "sources", "organized", "b.md"));

  const status = await getSourceStatus(workspace);
  assert.equal(status.pendingCount, 0);
  assert.equal(status.files.find((file) => file.path === "sources/organized/a.md")?.state, "unchanged");
  assert.equal(status.files.find((file) => file.path === "sources/organized/b.md")?.state, "unchanged");
  assert.equal(status.files.some((file) => file.state === "removed"), false);
});

test("migrates legacy raw to sources before default folder initialization", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-raw-migrate-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "raw"), { recursive: true });
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "raw", "a.md"), "alpha with raw/text preserved\n");
  await fs.writeFile(path.join(workspace, "index.md"), "See raw/a.md\n");
  await fs.mkdir(path.join(workspace, "wiki", "summaries"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "summaries", "a.md"), "Source: raw/a.md\n");

  await migrateLegacyWorkspace(workspace);

  assert.equal(await pathExists(path.join(workspace, "raw")), false);
  assert.equal(await fs.readFile(path.join(workspace, "sources", "a.md"), "utf8"), "alpha with raw/text preserved\n");
  assert.match(await fs.readFile(path.join(workspace, "index.md"), "utf8"), /sources\/a\.md/);
  assert.match(
    await fs.readFile(path.join(workspace, "wiki", "summaries", "a.md"), "utf8"),
    /sources\/a\.md/,
  );
});

test("prefers populated sources when legacy raw also contains files", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-raw-conflict-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "raw"), { recursive: true });
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "raw", "legacy.md"), "legacy\n");
  await fs.writeFile(path.join(workspace, "sources", "active.md"), "active\n");

  await migrateLegacyWorkspace(workspace);
  const status = await getSourceStatus(workspace);

  assert.equal(await pathExists(path.join(workspace, "raw", "legacy.md")), true);
  assert.equal(await pathExists(path.join(workspace, "sources", "active.md")), true);
  assert.equal(status.files.some((file) => file.path === "sources/active.md"), true);
  assert.equal(status.files.some((file) => file.path === "sources/legacy.md"), false);
});

test("migrates legacy metadata and rewrites review paths", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-metadata-migrate-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".studywiki", "changed"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".studywiki", "operations", "op"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".studywiki", "snapshots", "op", "tree", "raw"), {
    recursive: true,
  });
  await fs.writeFile(path.join(workspace, ".studywiki", "snapshots", "op", "tree", "raw", "a.md"), "alpha\n");
  await fs.writeFile(
    path.join(workspace, ".studywiki", "operations", "op", "report.md"),
    "Report for raw/a.md and study-chat\n",
  );
  await fs.writeFile(
    path.join(workspace, ".studywiki", "changed", "last-operation.json"),
    JSON.stringify(
      {
        operationId: "op",
        type: "study-chat",
        reportMarkdownPath: ".studywiki/operations/op/report.md",
        snapshotPath: ".studywiki/snapshots/op/tree",
        changedFiles: [{ path: "raw/a.md", allowed: true, restored: false }],
      },
      null,
      2,
    ),
  );

  await migrateLegacyWorkspace(workspace);

  assert.equal(await pathExists(path.join(workspace, ".studywiki")), false);
  assert.equal(
    await pathExists(path.join(workspace, ".aiwiki", "snapshots", "op", "tree", "sources", "a.md")),
    true,
  );
  const marker = await fs.readFile(
    path.join(workspace, ".aiwiki", "changed", "last-operation.json"),
    "utf8",
  );
  assert.match(marker, /"type": "explore-chat"/);
  assert.match(marker, /"reportMarkdownPath": ".aiwiki\/operations\/op\/report.md"/);
  assert.match(marker, /"snapshotPath": ".aiwiki\/snapshots\/op\/tree"/);
  assert.match(marker, /"path": "sources\/a.md"/);
  assert.doesNotMatch(marker, /\.studywiki|raw\/|study-chat/);
  assert.match(
    await fs.readFile(path.join(workspace, ".aiwiki", "operations", "op", "report.md"), "utf8"),
    /sources\/a\.md and explore-chat/,
  );
});

test("undo resolves legacy metadata paths when active metadata already exists", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-legacy-undo-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.mkdir(path.join(workspace, "wiki"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".aiwiki", "cache"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".studywiki", "changed"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".studywiki", "operations", "op"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".studywiki", "snapshots", "op", "tree", "raw"), {
    recursive: true,
  });
  await fs.writeFile(path.join(workspace, "index.md"), "# Index\n");
  await fs.writeFile(path.join(workspace, "log.md"), "# Log\n");
  await fs.writeFile(path.join(workspace, "schema.md"), "# Schema\n");
  await fs.writeFile(path.join(workspace, "AGENTS.md"), "# Agents\n");
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "changed\n");
  await fs.writeFile(path.join(workspace, ".aiwiki", "cache", "active.json"), "{}\n");
  await fs.writeFile(path.join(workspace, ".studywiki", "snapshots", "op", "tree", "raw", "a.md"), "alpha\n");
  await fs.writeFile(
    path.join(workspace, ".studywiki", "operations", "op", "report.json"),
    JSON.stringify(
      {
        id: "op",
        type: "build-wiki",
        snapshot: { id: "op", path: ".studywiki/snapshots/op" },
        changedFiles: [{ path: "raw/a.md", allowed: true, restored: false }],
      },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(workspace, ".studywiki", "changed", "last-operation.json"),
    JSON.stringify({ operationId: "op", reportPath: ".studywiki/operations/op/report.json" }, null, 2),
  );

  const originalLog = console.log;
  console.log = () => {};
  t.after(() => {
    console.log = originalLog;
  });
  await undoLastOperation(workspace);

  assert.equal(await fs.readFile(path.join(workspace, "sources", "a.md"), "utf8"), "alpha\n");
  assert.equal(await pathExists(path.join(workspace, ".studywiki", "operations", "op", "undo.json")), true);
  assert.equal(await pathExists(path.join(workspace, ".aiwiki", "changed", "last-operation.txt")), true);
});

test("undo restores runner-written source manifest from successful Build Wiki", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-undo-manifest-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".aiwiki", "changed"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".aiwiki", "operations", "op"), { recursive: true });
  await fs.writeFile(path.join(workspace, "index.md"), "# Index\n");
  await fs.writeFile(path.join(workspace, "log.md"), "# Log\n");
  await fs.writeFile(path.join(workspace, "schema.md"), "# Schema\n");
  await fs.writeFile(path.join(workspace, "AGENTS.md"), "# Agents\n");
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");

  const snapshot = await createSnapshot(workspace, "op");
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "a.md"), "# A\n");
  await writeSourceManifest(workspace, "op");
  assert.equal((await getSourceStatus(workspace)).pendingCount, 0);

  await fs.writeFile(
    path.join(workspace, ".aiwiki", "operations", "op", "report.json"),
    JSON.stringify(
      {
        id: "op",
        type: "build-wiki",
        status: "completed",
        completedAt: "2026-01-02T00:00:00.000Z",
        snapshot: { id: "op", path: path.relative(workspace, snapshot.dir) },
        changedFiles: [{ path: "wiki/concepts/a.md", allowed: true, restored: false }],
      },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(workspace, ".aiwiki", "changed", "last-operation.json"),
    JSON.stringify({ operationId: "op", reportPath: ".aiwiki/operations/op/report.json" }, null, 2),
  );

  const originalLog = console.log;
  console.log = () => {};
  t.after(() => {
    console.log = originalLog;
  });
  await undoLastOperation(workspace);

  assert.equal(await pathExists(path.join(workspace, SOURCE_MANIFEST_PATH)), false);
  assert.equal(await pathExists(path.join(workspace, "wiki", "concepts", "a.md")), false);
  const status = await getSourceStatus(workspace);
  assert.equal(status.inferredManifest, false);
  assert.equal(status.pendingCount, 1);
  assert.equal(status.files.find((file) => file.path === "sources/a.md")?.state, "new");
});

test("rewrites legacy source manifest paths without touching source file contents", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-manifest-migrate-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "raw"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".studywiki"), { recursive: true });
  await fs.writeFile(path.join(workspace, "raw", "a.md"), "keep literal raw/a.md in source\n");
  await fs.writeFile(
    path.join(workspace, ".studywiki", "source-manifest.json"),
    JSON.stringify({ files: [{ path: "raw/a.md", sha256: "x", size: 1, kind: "text" }] }, null, 2),
  );

  await migrateLegacyWorkspace(workspace);

  assert.equal(
    await fs.readFile(path.join(workspace, "sources", "a.md"), "utf8"),
    "keep literal raw/a.md in source\n",
  );
  const manifest = await fs.readFile(path.join(workspace, ".aiwiki", "source-manifest.json"), "utf8");
  assert.match(manifest, /sources\/a\.md/);
  assert.doesNotMatch(manifest, /raw\/a\.md/);
});

test("marks current sources as an existing wiki baseline", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-baseline-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");
  await fs.writeFile(path.join(workspace, "log.md"), "# Change Log\n\n");

  let status = await getSourceStatus(workspace);
  assert.equal(status.pendingCount, 1);
  assert.equal(status.files.find((file) => file.path === "sources/a.md")?.state, "new");

  const originalLog = console.log;
  console.log = () => {};
  t.after(() => {
    console.log = originalLog;
  });
  await markSourcesIngested(workspace);

  status = await getSourceStatus(workspace);
  assert.equal(status.manifestExists, true);
  assert.equal(status.pendingCount, 0);
  assert.equal(status.files.find((file) => file.path === "sources/a.md")?.state, "unchanged");
  assert.match(await fs.readFile(path.join(workspace, "log.md"), "utf8"), /Existing wiki baseline/);
});

test("source status ignores dot-prefixed files and directories under sources", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-hidden-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources", ".aiwiki", "chat-threads"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");
  await fs.writeFile(path.join(workspace, "sources", ".hidden.md"), "hidden\n");
  await fs.writeFile(
    path.join(workspace, "sources", ".aiwiki", "chat-threads", "thread.json"),
    "{}\n",
  );

  const status = await getSourceStatus(workspace);

  assert.equal(status.pendingCount, 1);
  assert.deepEqual(
    status.files.map((file) => file.path),
    ["sources/a.md"],
  );
});

test("infers source status from legacy successful Build Wiki report", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-infer-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");
  await fs.utimes(
    path.join(workspace, "sources", "a.md"),
    new Date("2026-01-01T00:00:00.000Z"),
    new Date("2026-01-01T00:00:00.000Z"),
  );

  const operationDir = path.join(workspace, ".aiwiki", "operations", "legacy-build");
  await fs.mkdir(operationDir, { recursive: true });
  await fs.writeFile(
    path.join(operationDir, "report.json"),
    JSON.stringify(
      {
        id: "legacy-build",
        type: "build-wiki",
        status: "completed",
        completedAt: "2026-01-02T00:00:00.000Z",
      },
      null,
      2,
    ),
  );

  let status = await getSourceStatus(workspace);
  assert.equal(status.inferredManifest, true);
  assert.equal(status.pendingCount, 0);
  assert.equal(status.files.find((file) => file.path === "sources/a.md")?.state, "unchanged");

  await fs.writeFile(path.join(workspace, "sources", "b.md"), "beta\n");
  await fs.utimes(
    path.join(workspace, "sources", "b.md"),
    new Date("2026-01-03T00:00:00.000Z"),
    new Date("2026-01-03T00:00:00.000Z"),
  );

  status = await getSourceStatus(workspace);
  assert.equal(status.pendingCount, 1);
  assert.equal(status.files.find((file) => file.path === "sources/b.md")?.state, "new");
});

test("organize sources restores source content edits", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-guard-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");

  const snapshot = await createSnapshot(workspace, "test-op");
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "changed\n");
  const changes = await diffSnapshot(workspace, snapshot);
  const validated = await validateAndRestoreChanges(
    workspace,
    snapshot,
    changes,
    ORGANIZE_SOURCES_ALLOWED_PATHS,
    { sourceMoveOnly: true },
  );

  const sourceChange = validated.find((change) => change.path === "sources/a.md");
  assert.equal(sourceChange?.allowed, false);
  assert.equal(sourceChange?.restored, true);
  assert.equal(await fs.readFile(path.join(workspace, "sources", "a.md"), "utf8"), "alpha\n");
});

test("organize sources allows move-only source renames with unchanged hashes", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-move-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");

  const snapshot = await createSnapshot(workspace, "test-op");
  await fs.mkdir(path.join(workspace, "sources", "week-1"), { recursive: true });
  await fs.rename(
    path.join(workspace, "sources", "a.md"),
    path.join(workspace, "sources", "week-1", "a.md"),
  );
  const changes = await diffSnapshot(workspace, snapshot);
  const validated = await validateAndRestoreChanges(
    workspace,
    snapshot,
    changes,
    ORGANIZE_SOURCES_ALLOWED_PATHS,
    { sourceMoveOnly: true },
  );

  assert.equal(validated.every((change) => change.allowed), true);
  assert.equal(validated.some((change) => change.restored), false);
  assert.equal(
    await fs.readFile(path.join(workspace, "sources", "week-1", "a.md"), "utf8"),
    "alpha\n",
  );
});

test("Build Wiki prompt is a thin operation brief", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-prompt-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");
  const sourceStatus = await getSourceStatus(workspace);

  const prompt = await buildWikiPrompt(
    workspace,
    { sourceStatus, extraInstruction: "Focus on exam review." },
    { sources: [], imageAttachments: [] },
  );

  assert.match(prompt, /Compile the workspace sources/);
  assert.match(prompt, /sources\/a\.md/);
  assert.doesNotMatch(prompt, /raw\/a\.md/);
  assert.match(prompt, /Focus on exam review/);
  assert.match(prompt, /Allowed write paths/);
  assert.match(prompt, /AGENTS\.md/);
  assert.match(prompt, /CLAUDE\.md/);
  assert.match(prompt, /source of truth for wiki rules/);
  assert.match(prompt, /Source files under sources\/\*\* may be moved or renamed/);
  assert.match(prompt, /source file contents must not be edited/);
  assert.match(prompt, /major files created or updated/);
  assert.match(prompt, /anything the user should review/);
  assert.doesNotMatch(prompt, /Math and equations:/);
  assert.doesNotMatch(prompt, /Use Obsidian-style wikilinks/);
  assert.doesNotMatch(prompt, /Use minimal wiki page frontmatter/);
});

test("new workspace schema scaffold documents wiki structure and durable rules", () => {
  const schema = wikiSchemaTemplate();

  assert.match(schema, /## Workspace Structure/);
  assert.match(schema, /wiki\/concepts\//);
  assert.match(schema, /wiki\/summaries\//);
  assert.match(schema, /wiki\/guides\//);
  assert.match(schema, /wiki\/assets\//);
  assert.match(schema, /assets\.json/);
  assert.match(schema, /capture substantial source units/);
  assert.match(schema, /Do not create mechanical summaries/);
  assert.match(schema, /create useful routes across multiple wiki pages/);
  assert.match(schema, /Do not create mechanical guide pages/);
  assert.match(schema, /sources:/);
  assert.match(schema, /created: 2026-05-03/);
  assert.match(schema, /updated: 2026-05-03/);
  assert.match(schema, /Keep frontmatter minimal/);
  assert.doesNotMatch(schema, /type: summary \| concept \| guide/);
  assert.match(schema, /persistent, compounding wiki/);
  assert.match(schema, /## Operation Model/);
  assert.match(schema, /sources\/ -> Build Wiki -> Ask Wiki -> Apply to Wiki -> Wiki Healthcheck -> Update Rules/);
  assert.match(schema, /## Build Wiki Rules/);
  assert.match(schema, /Build Wiki should integrate scoped source changes/);
  assert.match(schema, /Do not rely only on extracted text for visually meaningful sources/);
  assert.match(schema, /Distinguish pages inspected for understanding from images embedded/);
  assert.match(schema, /## Ask Wiki And Apply Rules/);
  assert.match(schema, /Apply to Wiki should save durable value from Ask Wiki/);
  assert.match(schema, /## Durable Preferences And Agent Files/);
  assert.match(schema, /Save a user preference to `schema\.md` only when the user explicitly asks/);
  assert.match(schema, /AGENTS\.md` and `CLAUDE\.md` are short bootstrap files/);
  assert.match(schema, /## Cross-References/);
  assert.match(schema, /## Math Formatting/);
  assert.match(schema, /## Source Citations/);
  assert.match(schema, /#Lstart-Lend/);
  assert.match(schema, /lecture-03\.txt#L15-L17/);
  assert.match(schema, /lecture-03-notes\.md#attention-mechanism/);
  assert.match(schema, /include that locator in the visible link label/);
  assert.match(schema, /Do not use `#L\.\.\.` line anchors on Markdown source files/);
  assert.match(schema, /Web references are external links used during Ask Wiki/);
  assert.match(schema, /found via Ask Wiki web search/);
  assert.match(schema, /## Visuals And Assets/);
  assert.match(schema, /smallest useful set/);
  assert.match(schema, /Save user-added images under `wiki\/assets\/user\/`/);
  assert.match(schema, /Preserve user-owned protected image assets/);
  assert.match(schema, /Managed image deletion must keep asset files, metadata, and Markdown references in sync/);
  assert.doesNotMatch(schema, /Maple updates it/);
  assert.match(schema, /\[!question\]/);
  assert.match(schema, /\[!warning\]/);
  assert.match(schema, /## Uncertainty, Conflicts, And Knowledge Gaps/);
  assert.match(schema, /## Index And Log Rules/);
  assert.match(schema, /one-line context for each page/);
  assert.match(schema, /## Wiki Healthcheck Rules/);
  assert.match(schema, /Wiki healthcheck should conservatively check and fix/);
  assert.match(schema, /Important concepts mentioned across multiple pages/);
  assert.match(schema, /Contradictions between pages/);
  assert.match(schema, /Web URLs incorrectly listed in frontmatter `sources`/);
  assert.match(schema, /Web-derived claims that lack inline URL citations/);
  assert.match(schema, /Source citations that are not clickable Markdown links/);
  assert.match(schema, /known exact locator is missing from the visible link label/);
  assert.match(schema, /generated preview\/cache files/);
});

test("initializes a blank workspace without sample sources", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-init-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  await initializeWorkspace(workspace);

  assert.equal(await pathExists(path.join(workspace, "sources", "sample-note.md")), false);
  assert.match(await fs.readFile(path.join(workspace, "index.md"), "utf8"), /# Maple Wiki/);
  assert.match(await fs.readFile(path.join(workspace, "log.md"), "utf8"), /Workspace created/);
  assert.match(await fs.readFile(path.join(workspace, "schema.md"), "utf8"), /capture substantial source units/);
  assert.match(await fs.readFile(path.join(workspace, "AGENTS.md"), "utf8"), /Follow `schema\.md`/);
  assert.match(await fs.readFile(path.join(workspace, "CLAUDE.md"), "utf8"), /Follow `schema\.md`/);
});

test("Build Wiki prompt includes first-build workspace context", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-context-prompt-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "a.md"), "alpha\n");
  const sourceStatus = await getSourceStatus(workspace);

  const prompt = await buildWikiPrompt(
    workspace,
    {
      sourceStatus,
      workspaceContext:
        "This is a robotics class wiki for exam review with beginner-friendly formula guides.",
    },
    { sources: [], imageAttachments: [] },
  );

  assert.match(prompt, /First-build workspace context/);
  assert.match(prompt, /robotics class wiki/);
  assert.match(prompt, /Update index\.md with a concise reader-facing introduction/);
  assert.match(prompt, /Update schema\.md with workspace-specific context/);
  assert.match(prompt, /rewrite the title, opening paragraph, and Workspace Context section/);
  assert.match(prompt, /Do not mention Maple in schema\.md/);
  assert.match(prompt, /Do not update AGENTS\.md or CLAUDE\.md for ordinary workspace context/);
  assert.match(prompt, /Update AGENTS\.md or CLAUDE\.md only when the user explicitly asks/);
});

test("Ask Wiki prompt uses extracted text for selected source decks", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "deck.pptx"), "placeholder\n");
  await fs.mkdir(path.join(workspace, ".aiwiki", "extracted", "20260504120000", "deck"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(workspace, ".aiwiki", "extracted", "20260504120000", "deck", "text.md"),
    "Slide 20: Korea benefits because the security alliance matters.\n",
  );

  const prompt = await buildExploreChatPrompt(workspace, {
    selectedPath: "sources/deck.pptx",
    question: "Why is security important here?",
    history: [],
  });

  assert.match(prompt, /latest extracted text for sources\/deck\.pptx/);
  assert.match(prompt, /security alliance matters/);
});

test("Ask Wiki source visuals attach explicitly referenced slide images", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-visual-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "deck.pptx"), "placeholder\n");

  const extractedDir = path.join(workspace, ".aiwiki", "extracted", "20260504120000", "deck");
  await fs.mkdir(path.join(extractedDir, "pages"), { recursive: true });
  await fs.mkdir(path.join(extractedDir, "prompt-images"), { recursive: true });
  const pages = [];
  for (let page = 1; page <= 12; page += 1) {
    const pageName = String(page).padStart(2, "0");
    await fs.writeFile(path.join(extractedDir, "pages", `page-${pageName}.png`), `png-${page}`);
    await fs.writeFile(path.join(extractedDir, "prompt-images", `page-${pageName}.jpg`), `jpg-${page}`);
    pages.push({
      page,
      image: `pages/page-${pageName}.png`,
      promptImage: `prompt-images/page-${pageName}.jpg`,
      textChars: page === 12 ? 30 : 0,
    });
  }
  await fs.writeFile(path.join(extractedDir, "prompt-images", "contact-sheet.jpg"), "sheet");
  await fs.writeFile(
    path.join(extractedDir, "manifest.json"),
    `${JSON.stringify({
      contactSheet: "prompt-images/contact-sheet.jpg",
      pageCount: 12,
      pages,
      textPath: "text.md",
    }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(extractedDir, "text.md"),
    "# Extracted PDF Text\n\n## Page 12\n\nThis slide explains the Naver visit photo.\n",
  );

  const context = await collectExploreSourceVisualContext(
    workspace,
    { name: "codex", supportsImageAttachments: true },
    {
      selectedPath: "sources/deck.pptx",
      question: "12번 슬라이드 사진은 무슨 의미야?",
      operationId: "chat",
      skipAiSelection: true,
    },
  );

  assert.equal(context.mode, "source-on-demand");
  assert.equal(context.selectionMode, "explicit-page-reference");
  assert.deepEqual(context.requestedPages, [12]);
  assert.deepEqual(
    context.imageAttachments.map((image) => image.path),
    [".aiwiki/extracted/20260504120000/deck/prompt-images/page-12.jpg"],
  );
  assert.deepEqual(context.attachedPages.map((page) => page.page), [12]);

  const prompt = await buildExploreChatPrompt(workspace, {
    selectedPath: "sources/deck.pptx",
    question: "12번 슬라이드 사진은 무슨 의미야?",
    history: [],
    sourceVisualContext: context,
  });

  assert.match(prompt, /Source visual context for the selected source/);
  assert.match(prompt, /Page 12: \.aiwiki\/extracted\/20260504120000\/deck\/prompt-images\/page-12\.jpg/);
  assert.match(prompt, /Do not unzip or dump the full Office\/PDF source/);
});

test("Ask Wiki source visuals attach contact sheet for visual questions without page numbers", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-contact-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "deck.pptx"), "placeholder\n");

  const extractedDir = path.join(workspace, ".aiwiki", "extracted", "20260504120000", "deck");
  await fs.mkdir(path.join(extractedDir, "pages"), { recursive: true });
  await fs.mkdir(path.join(extractedDir, "prompt-images"), { recursive: true });
  await fs.writeFile(path.join(extractedDir, "pages", "page-01.png"), "png");
  await fs.writeFile(path.join(extractedDir, "prompt-images", "page-01.jpg"), "jpg");
  await fs.writeFile(path.join(extractedDir, "prompt-images", "contact-sheet.jpg"), "sheet");
  await fs.writeFile(
    path.join(extractedDir, "manifest.json"),
    `${JSON.stringify({
      contactSheet: "prompt-images/contact-sheet.jpg",
      pageCount: 1,
      pages: [{ page: 1, image: "pages/page-01.png", promptImage: "prompt-images/page-01.jpg" }],
      textPath: "text.md",
    }, null, 2)}\n`,
  );
  await fs.writeFile(path.join(extractedDir, "text.md"), "# Extracted PDF Text\n\n## Page 1\n\nIntro\n");

  const context = await collectExploreSourceVisualContext(
    workspace,
    { name: "codex", supportsImageAttachments: true },
    {
      selectedPath: "sources/deck.pptx",
      question: "그 사진은 무슨 의미야?",
      operationId: "chat",
      skipAiSelection: true,
    },
  );

  assert.equal(context.mode, "source-on-demand");
  assert.equal(context.selectionMode, "contact-sheet-only");
  assert.equal(context.contactSheetAttached, true);
  assert.deepEqual(
    context.imageAttachments.map((image) => image.path),
    [".aiwiki/extracted/20260504120000/deck/prompt-images/contact-sheet.jpg"],
  );
});

test("Ask Wiki source visuals use Claude image path references", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-path-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "deck.pptx"), "placeholder\n");

  const extractedDir = path.join(workspace, ".aiwiki", "extracted", "20260504120000", "deck");
  await fs.mkdir(path.join(extractedDir, "pages"), { recursive: true });
  await fs.mkdir(path.join(extractedDir, "prompt-images"), { recursive: true });
  const pages = [];
  for (let page = 1; page <= 12; page += 1) {
    const pageName = String(page).padStart(2, "0");
    await fs.writeFile(path.join(extractedDir, "pages", `page-${pageName}.png`), `png-${page}`);
    await fs.writeFile(path.join(extractedDir, "prompt-images", `page-${pageName}.jpg`), `jpg-${page}`);
    pages.push({
      page,
      image: `pages/page-${pageName}.png`,
      promptImage: `prompt-images/page-${pageName}.jpg`,
      textChars: page === 12 ? 30 : 0,
    });
  }
  await fs.writeFile(
    path.join(extractedDir, "manifest.json"),
    `${JSON.stringify({
      pageCount: 12,
      pages,
      textPath: "text.md",
    }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(extractedDir, "text.md"),
    "# Extracted PDF Text\n\n## Page 12\n\nThis slide explains the Naver visit photo.\n",
  );

  const context = await collectExploreSourceVisualContext(
    workspace,
    { name: "claude", supportsImageAttachments: false, supportsImagePathReferences: true },
    {
      selectedPath: "sources/deck.pptx",
      question: "12번 슬라이드 사진은 무슨 의미야?",
      operationId: "chat",
      skipAiSelection: true,
    },
  );

  const absolutePagePath = path.join(
    workspace,
    ".aiwiki",
    "extracted",
    "20260504120000",
    "deck",
    "prompt-images",
    "page-12.jpg",
  );
  assert.equal(context.mode, "source-on-demand");
  assert.equal(context.imageInputMode, "path-referenced-images");
  assert.deepEqual(context.imageAttachments, []);
  assert.deepEqual(context.pathReferencedImages.map((image) => image.imageInputPath), [absolutePagePath]);

  const prompt = await buildExploreChatPrompt(workspace, {
    selectedPath: "sources/deck.pptx",
    question: "12번 슬라이드 사진은 무슨 의미야?",
    history: [],
    sourceVisualContext: context,
  });

  assert.match(prompt, /Source image files to inspect by absolute path/);
  assert.match(prompt, new RegExp(absolutePagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Ask Wiki raw source images use Claude image path references", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-raw-image-path-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "diagram.png"), "png");

  const context = await collectExploreSourceVisualContext(
    workspace,
    { name: "claude", supportsImageAttachments: false, supportsImagePathReferences: true },
    {
      selectedPath: "sources/diagram.png",
      question: "이 이미지 설명해줘",
      operationId: "chat",
    },
  );

  const absoluteImagePath = path.join(workspace, "sources", "diagram.png");
  assert.equal(context.mode, "source-on-demand");
  assert.equal(context.selectionMode, "source-image-path-reference");
  assert.deepEqual(context.imageAttachments, []);
  assert.deepEqual(context.pathReferencedImages.map((image) => image.imageInputPath), [absoluteImagePath]);

  const prompt = await buildExploreChatPrompt(workspace, {
    selectedPath: "sources/diagram.png",
    question: "이 이미지 설명해줘",
    history: [],
    sourceVisualContext: context,
  });

  assert.match(prompt, /Selected file: sources\/diagram\.png/);
  assert.match(prompt, /Source image files to inspect by absolute path/);
  assert.match(prompt, new RegExp(absoluteImagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Ask Wiki parses source page references conservatively", () => {
  assert.deepEqual(
    parseExplorePageReferences("12번 슬라이드랑 page 15-16도 봐줘", 20),
    [12, 15, 16],
  );
  assert.deepEqual(parseExplorePageReferences("2026년에 나온 자료", 20), []);
});

test("Ask Wiki attaches only selected wiki page asset images", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-wiki-image-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.mkdir(path.join(workspace, "wiki", "assets"), { recursive: true });
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "assets", "chart.png"), "png");
  await fs.writeFile(path.join(workspace, "wiki", "assets", "diagram.webp"), "webp");
  await fs.writeFile(path.join(workspace, "sources", "raw.png"), "raw");
  await fs.writeFile(
    path.join(workspace, "wiki", "concepts", "robotics.md"),
    [
      "# Robotics",
      "",
      "![chart](../assets/chart.png)",
      "![remote](https://example.com/chart.png)",
      "![raw](../../sources/raw.png)",
      "![missing](../assets/missing.png)",
      "![diagram][diagram-ref]",
      "",
      "[diagram-ref]: ../assets/diagram.webp",
    ].join("\n"),
  );

  const images = await collectWikiPageImageAttachments(workspace, "wiki/concepts/robotics.md");
  assert.deepEqual(
    images.map((image) => image.path),
    ["wiki/assets/chart.png", "wiki/assets/diagram.webp"],
  );

  const prompt = await buildExploreChatPrompt(workspace, {
    selectedPath: "wiki/concepts/robotics.md",
    question: "What does the chart show?",
    history: [],
    wikiImageAttachments: images,
  });

  assert.match(prompt, /Wiki images from the selected page/);
  assert.match(prompt, /wiki\/assets\/chart\.png/);
  assert.match(prompt, /wiki\/assets\/diagram\.webp/);
  const imageSection = prompt.slice(prompt.indexOf("Wiki images from the selected page"));
  assert.doesNotMatch(imageSection, /sources\/raw\.png/);
});

test("Ask Wiki wiki images use Claude image path references", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-wiki-image-path-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.mkdir(path.join(workspace, "wiki", "assets"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "assets", "chart.png"), "png");
  await fs.writeFile(
    path.join(workspace, "wiki", "concepts", "robotics.md"),
    [
      "# Robotics",
      "",
      "![chart](../assets/chart.png)",
    ].join("\n"),
  );

  const absoluteImagePath = path.join(workspace, "wiki", "assets", "chart.png");
  const images = await collectWikiPageImageAttachments(workspace, "wiki/concepts/robotics.md", {
    provider: { name: "claude", supportsImageAttachments: false, supportsImagePathReferences: true },
  });

  assert.deepEqual(images.map((image) => image.path), ["wiki/assets/chart.png"]);
  assert.deepEqual(images.map((image) => image.imageInputPath), [absoluteImagePath]);
  assert.deepEqual(images.map((image) => image.attached), [false]);

  const prompt = await buildExploreChatPrompt(workspace, {
    selectedPath: "wiki/concepts/robotics.md",
    question: "What does the chart show?",
    history: [],
    wikiImageAttachments: images,
  });

  assert.match(prompt, /Wiki images from the selected page/);
  assert.match(prompt, /Inspect these image files by absolute path/);
  assert.match(prompt, new RegExp(absoluteImagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("auto-registers referenced wiki image assets only", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-assets-register-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.mkdir(path.join(workspace, "wiki", "assets", "lecture"), { recursive: true });
  await fs.mkdir(path.join(workspace, ".aiwiki", "extracted"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "assets", "lecture", "slide-08.png"), "png");
  await fs.writeFile(path.join(workspace, "wiki", "assets", "lecture", "unused.png"), "png");
  await fs.writeFile(path.join(workspace, ".aiwiki", "extracted", "temp.png"), "png");
  await fs.writeFile(
    path.join(workspace, "wiki", "concepts", "motor.md"),
    [
      "# Motor",
      "",
      "![states](../assets/lecture/slide-08.png)",
      "_Figure: Source: [sources/lecture-03.pdf, page 8](../../sources/lecture-03.pdf#page=8)._",
      "![temp](../../.aiwiki/extracted/temp.png)",
    ].join("\n"),
  );

  const references = await collectReferencedWikiAssetImages(workspace);
  assert.deepEqual(references.map((item) => item.path), ["wiki/assets/lecture/slide-08.png"]);

  const result = await autoRegisterReferencedWikiAssets(workspace, { origin: "ai-generated" });
  assert.equal(result.added, 1);
  const registry = await readAssetRegistry(workspace);
  assert.equal(registry.assets.length, 1);
  assert.equal(registry.assets[0].displayPath, "wiki/assets/lecture/slide-08.png");
  assert.equal(registry.assets[0].protected, false);
  assert.equal(registry.assets[0].source?.path, "sources/lecture-03.pdf");
  assert.equal(registry.assets[0].source?.page, 8);
  assert.equal(await pathExists(path.join(workspace, ASSET_REGISTRY_PATH)), true);
});

test("protected image validation restores asset files and orphaned references", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-assets-protect-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.mkdir(path.join(workspace, "wiki", "assets", "user"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "assets", "user", "asset-1.display.png"), "original");
  await fs.writeFile(path.join(workspace, "wiki", "assets", "user", "asset-1.original.png"), "master");
  await fs.writeFile(
    path.join(workspace, ASSET_REGISTRY_PATH),
    JSON.stringify({
      schemaVersion: 1,
      assets: [
        {
          id: "asset-1",
          owner: "user",
          origin: "user-added",
          masterPath: "wiki/assets/user/asset-1.original.png",
          displayPath: "wiki/assets/user/asset-1.display.png",
          protected: true,
        },
      ],
    }),
  );
  await fs.writeFile(
    path.join(workspace, "wiki", "concepts", "rag.md"),
    "# RAG\n\n![flow](../assets/user/asset-1.display.png)\n",
  );

  const snapshot = await createSnapshot(workspace, "op-assets");
  await fs.writeFile(path.join(workspace, "wiki", "assets", "user", "asset-1.display.png"), "changed");
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "rag.md"), "# RAG\n\nImage removed.\n");
  const changes = await diffSnapshot(workspace, snapshot);
  const validated = changes.map((change) => ({ ...change, allowed: true, restored: false }));

  await validateAndRestoreProtectedAssets(workspace, snapshot, validated);

  assert.equal(
    await fs.readFile(path.join(workspace, "wiki", "assets", "user", "asset-1.display.png"), "utf8"),
    "original",
  );
  assert.match(
    await fs.readFile(path.join(workspace, "wiki", "concepts", "rag.md"), "utf8"),
    /asset-1\.display\.png/,
  );
  assert.equal(validated.find((change) => change.path.endsWith("asset-1.display.png"))?.allowed, false);
  assert.equal(validated.find((change) => change.path === "wiki/concepts/rag.md")?.allowed, false);
});

test("Ask Wiki source-only prompt asks for local answers", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-source-only-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const prompt = await buildExploreChatPrompt(workspace, {
    selectedPath: "",
    question: "What changed today?",
    history: [],
  });

  assert.match(prompt, /Source-only mode/);
  assert.match(prompt, /Answer from the local wiki/);
  assert.match(prompt, /web search would be needed/);
  assert.match(prompt, /direct them to Maple Guide from the lower-left speech-bubble button/);
});

test("Ask Wiki broad prompt uses hidden default wiki context", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-broad-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, "index.md"), "# Index\n\n- [[Concept A]]\n");
  await fs.writeFile(path.join(workspace, "schema.md"), "# Schema\n\nAnswer from the wiki first.\n");

  const prompt = await buildExploreChatPrompt(workspace, {
    selectedPath: "",
    question: "What are the main themes?",
    history: [],
  });

  assert.match(prompt, /No user-selected file was provided/);
  assert.match(prompt, /Hidden default context/);
  assert.match(prompt, /hidden default context: index\.md/);
  assert.match(prompt, /hidden default context: schema\.md/);
});

test("Ask Wiki fast path retrieves keyword chunks from the local wiki index", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-fast-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "index.md"), "# Index\n\n- [[Actuator Requirement Selection]]\n");
  await fs.writeFile(path.join(workspace, "schema.md"), "# Schema\n\nAnswer from local notes.\n");
  await fs.writeFile(
    path.join(workspace, "wiki", "concepts", "actuator.md"),
    [
      "# Actuator Requirement Selection",
      "",
      "Requirement selection compares torque, speed, cost, and manufacturability.",
      "Pareto-front reasoning is useful for pruning actuator candidates.",
    ].join("\n"),
  );

  const context = await prepareFastExploreChatContext(workspace, {
    selectedPath: "",
    question: "액추에이터 requirement selection 설명해줘",
    webSearch: false,
  });

  assert.equal(context.enabled, true);
  assert.equal(context.retrieval.scope, "whole-wiki");
  assert.equal(
    context.retrieval.chunks.some((chunk) => chunk.path === "wiki/concepts/actuator.md"),
    true,
  );
  assert.deepEqual(
    context.retrieval.globalContext.map((block) => block.path),
    ["schema.md", "index.md"],
  );
  assert.equal(await pathExists(path.join(workspace, ".aiwiki", "cache", "ask-wiki-index.json")), true);

  const prompt = await buildFastExploreChatPrompt(workspace, {
    selectedPath: "",
    question: "액추에이터 requirement selection 설명해줘",
    history: [],
    retrieval: context.retrieval,
  });
  assert.match(prompt, /Fast local keyword index mode/);
  assert.match(prompt, /Whole wiki grounding files/);
  assert.match(prompt, /Answer from local notes/);
  assert.match(prompt, /Pareto-front reasoning/);
  assert.match(prompt, /Retrieved local context \(keyword index\)/);
});

test("Ask Wiki fast path expands neighboring chunks around keyword hits", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-fast-neighbor-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "index.md"), "# Index\n\n- [[Drive Notes]]\n");
  await fs.writeFile(path.join(workspace, "schema.md"), "# Schema\n\nAnswer from local notes.\n");
  await fs.writeFile(
    path.join(workspace, "wiki", "concepts", "drive.md"),
    [
      "# Before",
      "",
      "Neighbor before context explains the motor sizing assumptions.",
      "",
      "# Target",
      "",
      "The azimuth controller uses a staged torque envelope for stable motion.",
      "",
      "# After",
      "",
      "Neighbor after context explains the thermal derating consequence.",
    ].join("\n"),
  );

  const index = await loadAskWikiKeywordIndex(workspace);
  const retrieval = retrieveAskWikiIndexChunks(index, {
    selectedPath: "",
    question: "azimuth controller 설명해줘",
  });
  const retrievedText = retrieval.chunks.map((chunk) => chunk.text).join("\n");

  assert.match(retrievedText, /staged torque envelope/);
  assert.match(retrievedText, /Neighbor before context/);
  assert.match(retrievedText, /Neighbor after context/);
  assert.equal(
    retrieval.chunks.some((chunk) => chunk.retrievalRole === "nearby"),
    true,
  );
});

test("Ask Wiki fast path retrieves real text from readable source files", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-fast-source-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources", "notes"), { recursive: true });
  await fs.writeFile(path.join(workspace, "index.md"), "# Index\n\n- [[Motor Notes]]\n");
  await fs.writeFile(path.join(workspace, "schema.md"), "# Schema\n\nAnswer from local notes.\n");
  await fs.writeFile(
    path.join(workspace, "sources", "notes", "motor-current-control.txt"),
    [
      "Motor current control lecture notes.",
      "",
      "The PI loop needs feedforward voltage terms and anti-windup near voltage saturation.",
    ].join("\n"),
  );

  const context = await prepareFastExploreChatContext(workspace, {
    selectedPath: "",
    question: "current control feedforward anti-windup 설명해줘",
    webSearch: false,
  });

  assert.equal(context.enabled, true);
  assert.equal(
    context.retrieval.chunks.some(
      (chunk) =>
        chunk.path === "sources/notes/motor-current-control.txt" &&
        chunk.text.includes("feedforward voltage terms"),
    ),
    true,
  );
});

test("Ask Wiki fast path defers when keyword retrieval has no real hit", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-fast-miss-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "index.md"), "# Index\n\n- [[Actuator Notes]]\n");
  await fs.writeFile(path.join(workspace, "schema.md"), "# Schema\n\nAnswer from local notes.\n");
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "actuator.md"), "# Actuator\n\nTorque notes.\n");

  const context = await prepareFastExploreChatContext(workspace, {
    selectedPath: "",
    question: "unmatched zirconium archive details",
    webSearch: false,
  });

  assert.equal(context.enabled, false);
  assert.equal(context.reason, "no-indexed-wiki-context");
});

test("Ask Wiki fast path defers when retrieval only found the catalog", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-fast-catalog-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(
    path.join(workspace, "index.md"),
    "# Index\n\n- document-archive-details - one-line catalog entry only\n",
  );
  await fs.writeFile(path.join(workspace, "schema.md"), "# Schema\n\nAnswer from local notes.\n");
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "actuator.md"), "# Actuator\n\nTorque notes.\n");

  const context = await prepareFastExploreChatContext(workspace, {
    selectedPath: "",
    question: "document archive details 정확한 내용 설명해줘",
    webSearch: false,
  });

  assert.equal(context.enabled, false);
  assert.equal(context.reason, "no-indexed-wiki-content");
});

test("Ask Wiki fast path stays inside the selected wiki page scope", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-fast-selected-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "index.md"), "# Index\n");
  await fs.writeFile(
    path.join(workspace, "wiki", "concepts", "motors.md"),
    "# Motors\n\nMotor notes mention torque and duty cycle.\n",
  );
  await fs.writeFile(
    path.join(workspace, "wiki", "concepts", "sensors.md"),
    "# Sensors\n\nSensor notes mention torque only as a calibration disturbance.\n",
  );

  const index = await loadAskWikiKeywordIndex(workspace);
  const retrieval = retrieveAskWikiIndexChunks(index, {
    selectedPath: "wiki/concepts/motors.md",
    question: "torque 정리해줘",
  });

  assert.equal(retrieval.scope, "selected-page");
  assert.equal(retrieval.chunks.length > 0, true);
  assert.deepEqual(
    Array.from(new Set(retrieval.chunks.map((chunk) => chunk.path))),
    ["wiki/concepts/motors.md"],
  );
});

test("Ask Wiki fast path defers to deep mode for web, source, and visual questions", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-fast-disabled-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "wiki", "concepts"), { recursive: true });
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "wiki", "concepts", "robotics.md"), "# Robotics\n\nRobot notes.\n");
  await fs.writeFile(path.join(workspace, "sources", "deck.pdf"), "placeholder\n");

  assert.equal(
    (await prepareFastExploreChatContext(workspace, {
      selectedPath: "",
      question: "latest robotics news",
      webSearch: true,
    })).reason,
    "web-search-enabled",
  );
  assert.equal(
    (await prepareFastExploreChatContext(workspace, {
      selectedPath: "sources/deck.pdf",
      question: "summarize",
      webSearch: false,
    })).reason,
    "selected-source",
  );
  assert.equal(
    (await prepareFastExploreChatContext(workspace, {
      selectedPath: "wiki/concepts/robotics.md",
      question: "이 그림 설명해줘",
      webSearch: false,
    })).reason,
    "visual-or-page-question",
  );
});

test("Ask Wiki web prompt requires local-first URL citations", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-web-chat-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const prompt = await buildExploreChatPrompt(workspace, {
    selectedPath: "",
    question: "What changed today?",
    history: [],
    webSearch: true,
  });

  assert.match(prompt, /Web search is enabled/);
  assert.match(prompt, /Use the local wiki and sources first/);
  assert.match(prompt, /include the source URL/);
  assert.match(prompt, /Do not imply web results are part of `sources\/`/);
});

test("agent scaffold keeps operation boundary short and delegates content rules", () => {
  const instructions = workspaceAgentInstructions("Workspace Agent Instructions");

  assert.match(instructions, /Ask Wiki is for questions about sources and the existing wiki/);
  assert.match(
    instructions,
    /Build Wiki, Apply to Wiki, Wiki Healthcheck, Improve Wiki, Organize Sources, and Update Wiki Rules/,
  );
  assert.match(instructions, /Treat `sources\/` as immutable/);
  assert.doesNotMatch(instructions, /Treat `raw\/` as immutable/);
  assert.match(instructions, /Follow `schema\.md` for durable wiki rules/);
  assert.match(instructions, /Update `schema\.md` only when the user explicitly asks/);
  assert.match(instructions, /Update `AGENTS\.md` or `CLAUDE\.md` only when the user explicitly asks/);
  assert.doesNotMatch(instructions, /frontmatter/);
  assert.doesNotMatch(instructions, /wikilinks/);
});

test("Apply to wiki prompt is a thin operation brief", () => {
  const prompt = buildApplyChatPrompt("/tmp/workspace", {
    scope: "question-and-answer",
    targetPath: "wiki/concepts/motor-operating-region.md",
    targetMessageId: "msg-1",
    instruction: "Make MTPA a separate concept.",
    messages: [
      {
        id: "msg-1",
        role: "user",
        contextPath: "wiki/concepts/motor-operating-region.md",
        text: "make the separate concept",
      },
    ],
  });

  assert.match(prompt, /Use workspace instructions already loaded by the CLI/);
  assert.doesNotMatch(prompt, /Read AGENTS\.md or CLAUDE\.md/);
  assert.match(prompt, /Allowed write paths/);
  assert.match(prompt, /wiki\/\*\*/);
  assert.match(prompt, /schema\.md/);
  assert.match(prompt, /Do not edit AGENTS\.md or CLAUDE\.md/);
  assert.match(prompt, /Never edit, rename, delete, or create files under sources\/\*\*/);
  assert.match(prompt, /Selected chat messages/);
  assert.doesNotMatch(prompt, /git status/);
  assert.doesNotMatch(prompt, /git diff --stat/);
  assert.doesNotMatch(prompt, /Use Obsidian-style wikilinks/);
});

test("Apply to wiki prompt marks web-search content as web references", () => {
  const prompt = buildApplyChatPrompt("/tmp/workspace", {
    scope: "question-and-answer",
    targetPath: "wiki/concepts/web-search.md",
    targetMessageId: "msg-2",
    instruction: "",
    messages: [
      {
        id: "msg-1",
        role: "user",
        contextPath: "wiki/concepts/web-search.md",
        text: "What is current?",
        webSearchEnabled: true,
      },
      {
        id: "msg-2",
        role: "assistant",
        contextPath: "wiki/concepts/web-search.md",
        text: "The docs say this changed. https://example.com/docs",
        webSearchEnabled: true,
      },
    ],
  });

  assert.match(prompt, /Some selected chat messages used Ask Wiki web search/);
  assert.match(prompt, /Treat web-derived material according to schema\.md/);
  assert.match(prompt, /Do not perform fresh web search during Apply/);
  assert.match(prompt, /\[used Ask Wiki web search\]/);
  assert.doesNotMatch(prompt, /## Web References/);
  assert.doesNotMatch(prompt, /found via Ask Wiki web search/);
});

test("maintenance prompts are thin operation briefs", async () => {
  const healthcheckPrompt = await buildMaintenancePrompt("/tmp/workspace", {
    operationType: "wiki-healthcheck",
    label: "Wiki healthcheck",
    instruction: "",
    allowedPathRules: WIKI_HEALTHCHECK_ALLOWED_PATHS,
  });

  assert.match(healthcheckPrompt, /Allowed write paths/);
  assert.match(healthcheckPrompt, /schema\.md/);
  assert.match(healthcheckPrompt, /AGENTS\.md/);
  assert.match(healthcheckPrompt, /CLAUDE\.md/);
  assert.match(healthcheckPrompt, /source of truth for wiki rules/);
  assert.match(healthcheckPrompt, /Do not edit, create, rename, or delete files under sources\/\*\*/);
  assert.match(healthcheckPrompt, /Update AGENTS\.md or CLAUDE\.md only when the user explicitly asks/);
  assert.doesNotMatch(healthcheckPrompt, /Required workflow/);
  assert.doesNotMatch(healthcheckPrompt, /Wiki Healthcheck Rules/);

  const rulesPrompt = await buildMaintenancePrompt("/tmp/workspace", {
    operationType: "update-rules",
    label: "Wiki rules",
    instruction: "Use source-span citations for high-risk claims.",
    allowedPathRules: UPDATE_RULES_ALLOWED_PATHS,
  });

  assert.match(rulesPrompt, /Update durable wiki rules according to the user instruction/);
  assert.match(rulesPrompt, /Allowed write paths/);
  assert.match(rulesPrompt, /AGENTS\.md/);
  assert.match(rulesPrompt, /CLAUDE\.md/);
  assert.doesNotMatch(rulesPrompt, /frontmatter/);
  assert.doesNotMatch(rulesPrompt, /wikilinks/);
});

test("Improve Wiki prompt has build-level permissions without build ingestion language", async () => {
  const prompt = await buildMaintenancePrompt("/tmp/workspace", {
    operationType: "improve-wiki",
    label: "Improve wiki",
    instruction: "Improve the study guide and remember that guides should include quizzes.",
    allowedPathRules: IMPROVE_WIKI_ALLOWED_PATHS,
    sourceMoveOnly: true,
  });

  assert.match(prompt, /sources\/\*\*/);
  assert.match(prompt, /wiki\/\*\*/);
  assert.match(prompt, /schema\.md/);
  assert.match(prompt, /AGENTS\.md/);
  assert.match(prompt, /CLAUDE\.md/);
  assert.match(prompt, /may be moved or renamed only when the user explicitly asks/);
  assert.doesNotMatch(prompt, /pending source changes/);
  assert.doesNotMatch(prompt, /Source-grounded improvement context/);
  assert.doesNotMatch(prompt, /source-manifest\.json.*successful build/);
});

test("Improve Wiki source grounding is opt-in and does not allow source edits", async () => {
  const prompt = await buildMaintenancePrompt("/tmp/workspace", {
    operationType: "improve-wiki",
    label: "Improve wiki",
    instruction: "Deepen weak explanations using the original material.",
    allowedPathRules: IMPROVE_WIKI_ALLOWED_PATHS,
    forbiddenPathRules: ["sources/**"],
    sourceMoveOnly: true,
    sourceStatus: {
      files: [
        { path: "sources/lecture-01.md", state: "unchanged" },
        { path: "sources/lecture-02.pdf", state: "new" },
      ],
    },
    sourceGrounding: {
      sourcePaths: ["sources/lecture-01.md", "sources/lecture-02.pdf"],
      preparedSources: {
        sources: [
          {
            sourcePath: "sources/lecture-02.pdf",
            textPath: ".aiwiki/extracted/op/lecture-02/text.md",
            pageImages: [],
            promptPageImages: [],
            selectedPromptImages: [],
          },
        ],
      },
    },
  });

  assert.match(prompt, /Source-grounded improvement context/);
  assert.match(prompt, /relevant source files/i);
  assert.match(prompt, /Do not rebuild the wiki from scratch/);
  assert.match(prompt, /Selected source files for this run/);
  assert.match(prompt, /Forbidden write paths:\n- sources\/\*\*/);
  assert.match(prompt, /Do not edit, create, rename, move, or delete files under sources\/\*\*/);
  assert.match(prompt, /sources\/lecture-01\.md \(unchanged\)/);
  assert.match(prompt, /sources\/lecture-02\.pdf \(new\)/);
  assert.match(prompt, /Prepared structured Markdown: \.aiwiki\/extracted\/op\/lecture-02\/text\.md/);
  assert.doesNotMatch(prompt, /runner updates it only after a successful build/);
});

test("Improve Wiki source grounding renders Claude source image path references", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "maple-improve-image-path-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "sources"), { recursive: true });
  await fs.writeFile(path.join(workspace, "sources", "diagram.png"), "png");

  const preparedSources = {
    sources: [{
      sourcePath: "sources/diagram.png",
      sourceSlug: "diagram",
      textPath: "",
      manifestPath: "",
      sourceImage: "sources/diagram.png",
      pageImages: [],
      promptPageImages: [],
      selectedPromptImages: [],
    }],
    imageAttachments: [],
    visualInput: null,
  };

  await selectBuildWikiVisualInputs(
    workspace,
    { name: "claude", supportsImageAttachments: false, supportsImagePathReferences: true },
    {
      operationId: "op",
      operationDir: path.join(workspace, ".aiwiki", "operations", "op"),
      dryRun: true,
    },
    preparedSources,
  );

  const absoluteImagePath = path.join(workspace, "sources", "diagram.png");
  assert.deepEqual(preparedSources.imageAttachments, []);
  assert.equal(preparedSources.sources[0].pagesToInspect[0].imageInputPath, absoluteImagePath);

  const prompt = await buildMaintenancePrompt(workspace, {
    operationType: "improve-wiki",
    label: "Improve wiki",
    instruction: "Use the diagram source.",
    allowedPathRules: IMPROVE_WIKI_ALLOWED_PATHS,
    forbiddenPathRules: ["sources/**"],
    sourceMoveOnly: true,
    sourceStatus: {
      files: [{ path: "sources/diagram.png", state: "new" }],
    },
    sourceGrounding: {
      sourcePaths: ["sources/diagram.png"],
      preparedSources,
    },
  });

  assert.match(prompt, /Source image path for inspection:/);
  assert.match(prompt, new RegExp(absoluteImagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompt, /Pages inspected through path-referenced images/);
  assert.doesNotMatch(prompt, /Source image attached to this prompt/);
});

test("source picker JSON parser accepts only source-relative paths", () => {
  assert.deepEqual(
    parseSourcePathsJson('["sources/b.md", "sources/a.md", "sources/a.md"]'),
    ["sources/b.md", "sources/a.md"],
  );

  assert.equal(parseSourcePathsJson(undefined), null);
  assert.throws(
    () => parseSourcePathsJson('["wiki/page.md"]'),
    /Invalid selected source path/,
  );
  assert.throws(
    () => parseSourcePathsJson('{"path":"sources/a.md"}'),
    /must be a JSON array/,
  );
});
