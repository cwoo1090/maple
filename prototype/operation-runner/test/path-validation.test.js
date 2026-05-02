const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isAllowedPath,
  isRunnerMetadataPath,
  normalizeMarkdownMathDelimiters,
  normalizeRelativePath,
} = require("../src/operation-runner");

test("normalizes safe relative paths", () => {
  assert.equal(normalizeRelativePath("wiki/concepts/memory.md"), "wiki/concepts/memory.md");
  assert.equal(normalizeRelativePath("./wiki/../index.md"), "index.md");
});

test("rejects path traversal and absolute paths", () => {
  assert.equal(normalizeRelativePath("../raw/source.md"), null);
  assert.equal(normalizeRelativePath("/tmp/source.md"), null);
});

test("allows Build Wiki write targets", () => {
  assert.equal(isAllowedPath("wiki/summaries/sample.md"), true);
  assert.equal(isAllowedPath("wiki/assets/sample/figure.png"), true);
  assert.equal(isAllowedPath("index.md"), true);
  assert.equal(isAllowedPath("log.md"), true);
  assert.equal(isAllowedPath("schema.md"), true);
  assert.equal(isAllowedPath(".studywiki/extracted/sample.json"), true);
});

test("forbids raw source edits during Build Wiki", () => {
  assert.equal(isAllowedPath("raw/sample-note.md"), false);
  assert.equal(isAllowedPath("raw/new-source.md"), false);
});

test("identifies runner-owned metadata paths", () => {
  assert.equal(isRunnerMetadataPath(".studywiki/snapshots/123/tree/index.md"), true);
  assert.equal(isRunnerMetadataPath(".studywiki/operations/123/report.json"), true);
  assert.equal(isRunnerMetadataPath(".studywiki/changed/last-operation.json"), true);
  assert.equal(isRunnerMetadataPath(".studywiki/extracted/sample.json"), false);
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
