const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  IMPROVE_WIKI_ALLOWED_PATHS,
  IMPROVE_WIKI_FORBIDDEN_PATHS,
  ORGANIZE_SOURCES_ALLOWED_PATHS,
  ASSET_REGISTRY_PATH,
  SOURCE_MANIFEST_PATH,
  WIKI_MANIFEST_PATH,
  WIKI_HEALTHCHECK_ALLOWED_PATHS,
  WIKI_WRITE_ALLOWED_PATHS,
  UPDATE_RULES_ALLOWED_PATHS,
  buildApplyChatPrompt,
  buildExploreChatPrompt,
  buildMaintenancePrompt,
  buildWikiPrompt,
  calculateFullSlideBudget,
  contactSheetRanges,
  collectExploreSourceVisualContext,
  collectReferencedWikiAssetImages,
  collectWikiPageImageAttachments,
  createSnapshot,
  diffSnapshot,
  fallbackSelectPageNumbers,
  getSourceStatus,
  getWikiStatus,
  getOutsideWikiChanges,
  initializeWorkspace,
  isAllowedPath,
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
  parseExplorePageReferences,
  parseSourcePathsJson,
  parseSlideSelectionJson,
  parseVisualInspectionPlanJson,
  readAssetRegistry,
  readRenderedPdfResult,
  renderPreparedSourcesForPrompt,
  renderSourceStatusForPrompt,
  resolveOperationId,
  selectBuildWikiVisualInputs,
  sourcePathsForBuild,
  autoRegisterReferencedWikiAssets,
  validateAndRestoreProtectedAssets,
  validateAndRestoreChanges,
  workspaceAgentInstructions,
  writeSourceManifest,
  writeWikiManifest,
  undoLastOperation,
  wikiSchemaTemplate,
} = require("../src/operation-runner");

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

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
  assert.equal(isRunnerMetadataPath(".aiwiki/extracted/sample.json"), false);
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

  assert.match(prompt, /Compile pending source changes/);
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
  assert.match(schema, /sources\/ -> Build Wiki -> Explore -> Apply to Wiki -> Wiki Healthcheck -> Update Rules/);
  assert.match(schema, /## Build Wiki Rules/);
  assert.match(schema, /Build Wiki should integrate scoped source changes/);
  assert.match(schema, /Do not rely only on extracted text for visually meaningful sources/);
  assert.match(schema, /Distinguish pages inspected for understanding from images embedded/);
  assert.match(schema, /## Explore And Apply Rules/);
  assert.match(schema, /Apply to Wiki should save durable value from Explore/);
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
  assert.match(schema, /Web references are external links used during Explore Chat/);
  assert.match(schema, /found via Explore web search/);
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

test("Explore Chat prompt uses extracted text for selected source decks", async (t) => {
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

test("Explore Chat source visuals attach explicitly referenced slide images", async (t) => {
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
  assert.match(prompt, /Do not unzip or dump the full PPTX\/PDF/);
});

test("Explore Chat source visuals attach contact sheet for visual questions without page numbers", async (t) => {
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

test("Explore Chat parses source page references conservatively", () => {
  assert.deepEqual(
    parseExplorePageReferences("12번 슬라이드랑 page 15-16도 봐줘", 20),
    [12, 15, 16],
  );
  assert.deepEqual(parseExplorePageReferences("2026년에 나온 자료", 20), []);
});

test("Explore Chat attaches only selected wiki page asset images", async (t) => {
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

test("Explore Chat source-only prompt asks for local answers", async (t) => {
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
});

test("Explore Chat web prompt requires local-first URL citations", async (t) => {
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

  assert.match(instructions, /Explore Chat is read-only/);
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

  assert.match(prompt, /Some selected chat messages used Explore web search/);
  assert.match(prompt, /Treat web-derived material according to schema\.md/);
  assert.match(prompt, /Do not perform fresh web search during Apply/);
  assert.match(prompt, /\[used Explore web search\]/);
  assert.doesNotMatch(prompt, /## Web References/);
  assert.doesNotMatch(prompt, /found via Explore web search/);
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
  assert.match(prompt, /Extracted text: \.aiwiki\/extracted\/op\/lecture-02\/text\.md/);
  assert.doesNotMatch(prompt, /runner updates it only after a successful build/);
});

test("source picker JSON parser accepts only source-relative paths", () => {
  assert.deepEqual(
    parseSourcePathsJson('["sources/b.md", "sources/a.md", "sources/a.md"]'),
    ["sources/a.md", "sources/b.md"],
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
