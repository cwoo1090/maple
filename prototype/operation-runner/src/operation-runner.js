#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const { selectProvider } = require("./providers");

const PROTOTYPE_ROOT = path.resolve(__dirname, "..");
const DEFAULT_WORKSPACE = path.join(PROTOTYPE_ROOT, "sample-workspace");
const RUNNER_METADATA_PREFIXES = [
  ".studywiki/snapshots/",
  ".studywiki/operations/",
  ".studywiki/changed/",
  ".studywiki/running/",
];
const DEFAULT_CODEX_TIMEOUT_MS = 15 * 60 * 1000;
const RUNNING_MARKER_PATH = ".studywiki/running/operation.json";
const BUILD_WIKI_ALLOWED_PATHS = [
  "wiki/**",
  "index.md",
  "log.md",
  "schema.md",
  ".studywiki/**",
];
const WORKSPACE_DIRECTORIES = [
  "raw",
  "wiki/concepts",
  "wiki/summaries",
  "wiki/guides",
  "wiki/assets",
  ".studywiki",
  ".studywiki/running",
];

async function main(argv = process.argv.slice(2)) {
  const { command, args, flags } = parseArgs(argv);

  try {
    switch (command) {
      case "create-sample":
        await createSampleWorkspace(resolveWorkspace(args[0]), {
          force: Boolean(flags.force),
        });
        break;
      case "check-codex":
        flags.provider = "codex";
        // fall through
      case "check": {
        const providerName = flags.provider || "codex";
        const provider = selectProvider(providerName);
        const installed = provider.checkInstalled();
        const auth = installed.installed
          ? provider.checkLoggedIn()
          : { loggedIn: false, statusText: null, warnings: [] };
        console.log(JSON.stringify({
          provider: provider.name,
          installed,
          auth,
          installCommand: provider.installCommand,
          loginCommand: provider.loginCommand,
        }, null, 2));
        break;
      }
      case "check-soffice":
        await printSofficeCheck();
        break;
      case "build":
      case "build-wiki":
        await runBuildWiki(resolveWorkspace(args[0]), {
          provider: flags.provider || "codex",
          model: flags.model || "",
          extraInstruction: flags.instruction || "",
          promptFile: flags["prompt-file"] || "",
          dryRun: Boolean(flags["dry-run"]),
          strictValidation: Boolean(flags["strict-validation"]),
          timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
        });
        break;
      case "status":
        await printStatus(resolveWorkspace(args[0]));
        break;
      case "undo":
        await undoLastOperation(resolveWorkspace(args[0]));
        break;
      case "cancel":
        await cancelRunningOperation(resolveWorkspace(args[0]));
        break;
      case "progress":
        await printRunningProgress(resolveWorkspace(args[0]));
        break;
      case "interrupted":
        await printInterruptedOperation(resolveWorkspace(args[0]));
        break;
      case "discard-interrupted":
        await discardInterruptedOperation(resolveWorkspace(args[0]));
        break;
      case "help":
      case "--help":
      case "-h":
      case "":
        printHelp();
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(`\nerror: ${error.message}`);
    if (process.env.DEBUG_OPERATION_RUNNER) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}

function printHelp() {
  console.log(`Study Wiki operation runner prototype

Usage:
  node src/operation-runner.js create-sample [workspace] [--force]
  node src/operation-runner.js check [--provider codex|claude]
  node src/operation-runner.js build [workspace] [--provider codex|claude] [--model <id>] [--instruction "..."] [--strict-validation] [--timeout-ms 600000]
  node src/operation-runner.js status [workspace]
  node src/operation-runner.js undo [workspace]

Default workspace:
  ${DEFAULT_WORKSPACE}

The build command creates a snapshot, runs one Codex "Build Wiki" operation,
detects changed files, validates them against the Build Wiki allowlist, restores
forbidden edits, and writes a report under .studywiki/operations/.
`);
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === true || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const [command = "", ...rest] = argv;
  const args = [];
  const flags = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    if (inlineValue !== undefined && inlineValue !== "") {
      flags[rawName] = inlineValue;
      continue;
    }

    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[rawName] = next;
      index += 1;
    } else {
      flags[rawName] = true;
    }
  }

  return { command, args, flags };
}

function resolveWorkspace(workspaceArg) {
  if (!workspaceArg) return DEFAULT_WORKSPACE;
  return path.resolve(process.cwd(), workspaceArg);
}

async function createSampleWorkspace(workspace, options = {}) {
  const markerPath = path.join(workspace, ".studywiki", "prototype-workspace.json");

  if (options.force && (await exists(workspace))) {
    if (!(await exists(markerPath))) {
      throw new Error(
        `Refusing to --force reset ${workspace}; it does not look like a prototype sample workspace.`,
      );
    }
    await fsp.rm(workspace, { recursive: true, force: true });
  }

  await ensureWorkspaceDirectories(workspace);

  await writeFileIfMissing(
    path.join(workspace, "raw", "sample-note.md"),
    `# Sample Note: Retrieval Practice and Spaced Repetition

Retrieval practice means trying to recall an idea before checking the answer.
It is more effective than only rereading because it strengthens memory and
reveals gaps.

Spaced repetition means reviewing material after increasing time intervals.
The spacing effect works best when reviews happen just before the learner would
forget the material.

For studying, a useful loop is:

1. Read a short source.
2. Close the source and write what you remember.
3. Check the source and correct mistakes.
4. Schedule another review later.

Source note: This is a synthetic sample source for the operation-runner spike.
`,
  );

  await writeFileIfMissing(
    path.join(workspace, "index.md"),
    `# Sample Study Wiki

This workspace is ready for sources to be compiled into a local study wiki.

## Wiki Sections

No generated wiki pages yet.
`,
  );

  await writeFileIfMissing(
    path.join(workspace, "log.md"),
    `# Change Log

- Workspace created for the operation-runner prototype.
`,
  );

  await writeFileIfMissing(
    path.join(workspace, "schema.md"),
    `# Study Wiki Schema

## Page Types

- Summary pages live under \`wiki/summaries/\` and explain one raw source.
- Concept pages live under \`wiki/concepts/\` and explain one reusable idea.
- Guide pages live under \`wiki/guides/\` and sequence concepts for study.

## Frontmatter

Use YAML frontmatter for generated wiki pages:

\`\`\`yaml
---
type: summary | concept | guide
title: Page title
sources:
  - raw/sample-note.md
---
\`\`\`

## Style Rules

- Write for a non-technical learner.
- Prefer short sections and concrete examples.
- Use contextual wikilinks sparingly, such as \`[[retrieval-practice]]\`, at the first place a reader may want to branch.
- Do not over-link repeated terms in the same short section.
- Use \`$...$\` for inline math and \`$$...$$\` for display math. Do not use \`\\(...\\)\` or \`\\[...\\]\`.
- Cite raw sources with relative paths.
- Do not modify files under \`raw/\`.
`,
  );

  await writeFileIfMissing(
    path.join(workspace, "AGENTS.md"),
    `# Workspace Agent Instructions

This is an AI Study Wiki Builder workspace for a student or self-learner.

## Required Workflow

- Treat \`raw/\` as immutable source material.
- Read \`schema.md\` and \`index.md\` before making wiki changes.
- Build study wiki pages under \`wiki/\`.
- Update \`index.md\` when adding or removing wiki pages.
- Append a short entry to \`log.md\` after wiki changes.
- Only update \`schema.md\` for durable wiki conventions.
- Use contextual links sparingly at the first useful in-body mention of a related concept.
- Prefer one canonical page per durable concept and link to it instead of repeating its full explanation.
- Format wiki math with \`$...$\` and \`$$...$$\`, not escaped LaTeX delimiters.

## Build Wiki Writes

Build Wiki operations may write:

- \`wiki/**\`
- \`index.md\`
- \`log.md\`
- \`schema.md\`
- \`.studywiki/**\`

Never modify source files under \`raw/\`.
`,
  );

  await fsp.writeFile(
    markerPath,
    `${JSON.stringify(
      {
        generatedBy: "prototype/operation-runner",
        workspaceModel: "study-wiki",
        createdOrUpdatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Sample workspace ready: ${workspace}`);
}


async function printSofficeCheck() {
  const check = checkSoffice();
  console.log(JSON.stringify(check, null, 2));

  if (!check.installed) {
    console.log("\nLibreOffice (soffice) is not installed. Required to process .pptx files.");
    console.log(`  ${check.installCommand}`);
  }
}

function checkCodex() {
  const pathCommand =
    process.platform === "win32"
      ? spawnSync("where", ["codex"], { encoding: "utf8" })
      : spawnSync("sh", ["-lc", "command -v codex"], { encoding: "utf8" });

  const installed = pathCommand.status === 0 && pathCommand.stdout.trim().length > 0;
  const result = {
    installed,
    path: installed ? pathCommand.stdout.trim().split(/\r?\n/)[0] : null,
    version: null,
    loginStatus: null,
    loggedIn: false,
    installCommand: "npm i -g @openai/codex",
    loginCommand: "codex login",
  };

  if (!installed) return result;

  const version = spawnSync("codex", ["--version"], { encoding: "utf8" });
  result.version = cleanCommandText(version.stdout || version.stderr);

  const login = spawnSync("codex", ["login", "status"], { encoding: "utf8" });
  result.loginStatus = cleanCommandText(login.stdout || login.stderr);
  result.loggedIn = login.status === 0 && /logged in/i.test(result.loginStatus || "");

  return result;
}

function checkSoffice() {
  const pathCommand =
    process.platform === "win32"
      ? spawnSync("where", ["soffice"], { encoding: "utf8" })
      : spawnSync("sh", ["-lc", "command -v soffice"], { encoding: "utf8" });

  const installed = pathCommand.status === 0 && pathCommand.stdout.trim().length > 0;
  return {
    installed,
    path: installed ? pathCommand.stdout.trim().split(/\r?\n/)[0] : null,
    installCommand: "brew install --cask libreoffice",
    purpose: "Converts .pptx sources to PDF before the existing PDF extraction pipeline runs.",
  };
}

async function runBuildWiki(workspace, options = {}) {
  await assertWorkspace(workspace);

  const provider = selectProvider(options.provider || "codex");
  const installed = provider.checkInstalled();
  if (!installed.installed) {
    throw new Error(`${provider.name} CLI is not installed. Run: ${provider.installCommand}`);
  }
  const auth = provider.checkLoggedIn();
  if (!auth.loggedIn) {
    throw new Error(`${provider.name} login was not confirmed. Run: ${provider.loginCommand}`);
  }

  const rawSourcesPreview = await listRawSourceFiles(workspace);
  const hasPptx = rawSourcesPreview.some((s) => s.toLowerCase().endsWith(".pptx"));
  if (hasPptx) {
    const soffice = checkSoffice();
    if (!soffice.installed) {
      throw new Error(
        "LibreOffice (soffice) is required to process .pptx files but was not found.\n" +
          `Install with: ${soffice.installCommand}\n` +
          "Or convert your .pptx files to PDF and re-add them to raw/.",
      );
    }
  }

  const operationId = createOperationId();
  const operationDir = path.join(workspace, ".studywiki", "operations", operationId);
  const changedDir = path.join(workspace, ".studywiki", "changed");
  await ensureDir(operationDir);
  await ensureDir(changedDir);

  const startedAt = new Date().toISOString();
  const snapshot = await createSnapshot(workspace, operationId);
  const preparedSources = await prepareSourceArtifacts(workspace, operationId);
  const prompt = await buildWikiPrompt(workspace, options, preparedSources);
  const promptPath = path.join(operationDir, "prompt.md");
  const eventsPath = path.join(operationDir, "events.jsonl");
  const stderrPath = path.join(operationDir, "stderr.log");
  const lastMessagePath = path.join(operationDir, "last-message.md");
  const reportPath = path.join(operationDir, "report.json");
  const reportMarkdownPath = path.join(operationDir, "report.md");

  await fsp.writeFile(promptPath, prompt);

  const imageCount = preparedSources.imageAttachments.length;
  const maxTurns = Math.max(25, imageCount + 20);

  const args = provider.buildExecArgs({
    workspace,
    model: options.model || provider.defaultModel,
    lastMessagePath,
    imageAttachments: preparedSources.imageAttachments,
    maxTurns,
  });

  console.log(`Snapshot created: ${path.relative(workspace, snapshot.dir)}`);
  console.log(`Running ${provider.name} Build Wiki operation...`);
  console.log(`Command: ${provider.binary} ${args.join(" ")} <prompt via stdin>`);

  let codexResult = {
    skipped: true,
    exitCode: 0,
    signal: null,
    command: provider.binary,
    args: args.concat("<prompt via stdin>"),
    eventsPath: path.relative(workspace, eventsPath),
    stderrPath: path.relative(workspace, stderrPath),
    lastMessagePath: path.relative(workspace, lastMessagePath),
  };

  if (!options.dryRun) {
    codexResult = await runProviderExec(provider, args, prompt, {
      cwd: workspace,
      eventsPath,
      stderrPath,
      runningMarkerPath: path.join(workspace, RUNNING_MARKER_PATH),
      timeoutMs: options.timeoutMs,
      operationId,
      operationType: "build-wiki",
    });
  } else {
    await fsp.writeFile(eventsPath, "");
    await fsp.writeFile(stderrPath, "dry run: codex exec was not started\n");
  }

  await normalizeGeneratedMarkdownFiles(workspace);

  const finalize = await provider.finalizeLastMessage({
    eventsPath,
    lastMessagePath,
  });

  const changedFiles = await diffSnapshot(workspace, snapshot);
  const validatedChanges = await validateAndRestoreChanges(workspace, snapshot, changedFiles);
  const userVisibleChangedFiles = getUserVisibleChangedFiles(validatedChanges);
  const completedAt = new Date().toISOString();
  const forbiddenCount = validatedChanges.filter((change) => !change.allowed).length;
  const allowedCount = validatedChanges.filter((change) => change.allowed).length;
  const wikiContentChanged = userVisibleChangedFiles.some((c) => {
    const p = c.path;
    return (
      p.startsWith("wiki/concepts/") ||
      p.startsWith("wiki/summaries/") ||
      p.startsWith("wiki/guides/")
    );
  });
  const indexOrLogTouched = userVisibleChangedFiles.some(
    (c) => c.path === "index.md" || c.path === "log.md",
  );
  const producedExpectedContent = wikiContentChanged && indexOrLogTouched;

  let status;
  if (codexResult.timedOut) {
    status = "timed_out";
  } else if (codexResult.cancelled) {
    status = "cancelled";
  } else if (finalize.subtype === "error_max_turns") {
    status = "turn_budget_exceeded";
  } else if (finalize.subtype === "error_during_execution" || codexResult.exitCode !== 0) {
    status = "provider_failed";
  } else if (forbiddenCount > 0) {
    status = "completed_with_forbidden_edits_restored";
  } else if (!producedExpectedContent && !options.dryRun) {
    status = "completed_without_wiki_content";
  } else {
    status = "completed";
  }

  const report = {
    id: operationId,
    type: "build-wiki",
    provider: provider.name,
    model: options.model || provider.defaultModel,
    status,
    workspace,
    startedAt,
    completedAt,
    allowedPathRules: BUILD_WIKI_ALLOWED_PATHS,
    snapshot: {
      id: snapshot.id,
      path: path.relative(workspace, snapshot.dir),
      manifestPath: path.relative(workspace, snapshot.manifestPath),
    },
    codex: codexResult,
    changedFiles: validatedChanges,
    userVisibleChangedFiles,
    completionCheck: {
      wikiContentChanged,
      indexOrLogTouched,
      producedExpectedContent,
      requiredCategories: ["wiki/concepts/", "wiki/summaries/", "wiki/guides/"],
      requiredBookkeeping: ["index.md", "log.md"],
    },
    summary: {
      totalChangedFiles: validatedChanges.length,
      allowedChangedFiles: allowedCount,
      forbiddenChangedFiles: forbiddenCount,
      restoredForbiddenFiles: validatedChanges.filter((change) => change.restored).length,
      userVisibleChangedFiles: userVisibleChangedFiles.length,
    },
  };

  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await fsp.writeFile(reportMarkdownPath, renderReportMarkdown(report));
  await writeChangedMarkers(workspace, report, reportPath, reportMarkdownPath);

  console.log("\nOperation report:");
  console.log(`  ${path.relative(process.cwd(), reportMarkdownPath)}`);
  console.log(`User-visible changed files: ${userVisibleChangedFiles.length}`);
  for (const change of userVisibleChangedFiles) {
    console.log(`  ${change.status.padEnd(8)} ${change.path}`);
  }
  if (forbiddenCount > 0) {
    console.log(`Restored forbidden changes: ${forbiddenCount}`);
    for (const change of validatedChanges.filter((item) => !item.allowed)) {
      console.log(`  ${change.status.padEnd(8)} ${change.path}`);
    }
  }
  if (status === "completed_without_wiki_content") {
    console.log(
      "\nWarning: Codex exited cleanly but no wiki page or index/log update was produced.",
    );
    console.log(
      "  This usually means the build did not finish (turn budget, sandbox issue, or unprepared sources).",
    );
    if (!wikiContentChanged) {
      console.log("  - No new/updated files under wiki/concepts/, wiki/summaries/, or wiki/guides/.");
    }
    if (!indexOrLogTouched) {
      console.log("  - index.md or log.md was not updated.");
    }
    console.log("  Consider running 'npm run undo' and retrying.");
  }

  if (codexResult.exitCode !== 0) {
    process.exitCode = codexResult.exitCode || 1;
  } else if (forbiddenCount > 0 && options.strictValidation) {
    process.exitCode = 2;
  } else if (status === "completed_without_wiki_content" && options.strictValidation) {
    process.exitCode = 3;
  }
}

async function runProviderExec(provider, args, prompt, paths) {
  await fsp.writeFile(paths.eventsPath, "");
  await fsp.writeFile(paths.stderrPath, "");

  const runningMarkerPath = paths.runningMarkerPath
    ? paths.runningMarkerPath
    : path.join(paths.cwd, RUNNING_MARKER_PATH);
  const timeoutMs = paths.timeoutMs && paths.timeoutMs > 0
    ? paths.timeoutMs
    : provider.defaultTimeoutMs;

  return new Promise((resolve, reject) => {
    const child = spawn(provider.binary, args, {
      cwd: paths.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: provider.buildSpawnEnv(process.env),
    });
    const eventsStream = fs.createWriteStream(paths.eventsPath, { flags: "a" });
    const stderrStream = fs.createWriteStream(paths.stderrPath, { flags: "a" });

    let timedOut = false;
    let cleared = false;

    const writeMarker = () => {
      try {
        fs.mkdirSync(path.dirname(runningMarkerPath), { recursive: true });
        fs.writeFileSync(
          runningMarkerPath,
          JSON.stringify(
            {
              operationId: paths.operationId || null,
              type: paths.operationType || "build-wiki",
              pid: child.pid,
              startedAt: new Date().toISOString(),
              timeoutMs,
              workspace: paths.cwd,
            },
            null,
            2,
          ),
        );
      } catch (_error) {}
    };

    const clearMarker = () => {
      if (cleared) return;
      cleared = true;
      try {
        if (fs.existsSync(runningMarkerPath)) {
          fs.unlinkSync(runningMarkerPath);
        }
      } catch (_error) {}
    };

    writeMarker();

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch (_error) {}
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch (_error) {}
      }, 3000);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      eventsStream.write(chunk);
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderrStream.write(chunk);
      process.stderr.write(chunk);
    });

    provider.feedPrompt(child, prompt);

    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      clearMarker();
      eventsStream.end();
      stderrStream.end();
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      clearTimeout(timeoutHandle);
      clearMarker();
      eventsStream.end();
      stderrStream.end();
      let cancelRequested = false;
      if (paths.operationId) {
        const flagPath = path.join(
          paths.cwd,
          ".studywiki",
          "operations",
          paths.operationId,
          "cancel-requested.flag",
        );
        try {
          cancelRequested = fs.existsSync(flagPath);
        } catch (_e) {}
      }
      resolve({
        skipped: false,
        exitCode,
        signal,
        timedOut,
        cancelled:
          !timedOut &&
          (cancelRequested || signal === "SIGTERM" || signal === "SIGKILL"),
        command: provider.binary,
        args: args.concat("<prompt via stdin>"),
        eventsPath: path.relative(paths.cwd, paths.eventsPath),
        stderrPath: path.relative(paths.cwd, paths.stderrPath),
        lastMessagePath: path.relative(
          paths.cwd,
          args[args.indexOf("--output-last-message") + 1],
        ),
      });
    });
  });
}

async function buildWikiPrompt(workspace, options, preparedSources = { sources: [] }) {
  const rawSources = await listRawSourceFiles(workspace);
  const rawSourceList = rawSources.length
    ? rawSources.map((source) => `- ${source}`).join("\n")
    : "- No files under raw/ yet.";
  const preparedSourceList = renderPreparedSourcesForPrompt(preparedSources);
  let prompt = `You are running a Build Wiki operation for AI Study Wiki Builder.

Goal:
- Compile the raw study sources into a small local study wiki.

Required reading:
- AGENTS.md
- schema.md
- index.md
- Source files under raw/:
${rawSourceList}
${preparedSourceList}

Required writes:
- Create or update source-grounded summary pages under wiki/summaries/.
- Create related concept pages under wiki/concepts/.
- Create a short study guide under wiki/guides/.
- Update index.md so the generated pages are discoverable.
- Append a dated entry to log.md summarizing the operation.

Permission boundary:
- Allowed write paths: wiki/**, index.md, log.md, schema.md, .studywiki/**
- Do not edit, rename, delete, or create files under raw/**.
- Keep the output concise and source-grounded.

Source handling:
- Treat raw/ as immutable.
- For text sources, read them directly.
- For binary sources such as PDF, PPTX, DOCX, or images, use local tools as needed to inspect or extract content.
- If extraction creates intermediate files, write them under .studywiki/extracted/.
- Cite the original raw source paths in generated wiki pages.

Reading prepared images:
- Read every image listed under "Prepared source artifacts" before writing any wiki page.
- Treat skipping any prepared image as a failure mode.
- If a prepared text file is also present for a source, read both.

Visual assets:
- If a source contains useful figures, diagrams, charts, screenshots, or slide visuals, extract a focused set of study-worthy images.
- Store selected images under wiki/assets/<source-slug>/ with stable names such as slide-04-requirements.png.
- Insert Markdown image references near the related explanation in summary, concept, or guide pages.
- Use concise alt text and captions that explain why the image matters for studying.
- Do not dump every embedded image; choose visuals that clarify the wiki content.
- Use .studywiki/extracted/ only for scratch extraction outputs or manifests, not final user-facing images.
- Prepared PDF page images are already upright; copy them as-is unless you have verified that a rotation is actually needed.

Math and equations:
- Preserve important equations cleanly.
- Use \`$...$\` for short inline variables and expressions inside prose or list items.
- Use display LaTeX blocks for formulas you can confidently read, for example:
  $$
  J_{\\mathrm{rotor}\\to\\mathrm{out}} \\approx N^2 J_m
  $$
- Use proper subscripts, superscripts, fractions, matrices, Greek letters, and \\mathrm{} labels.
- Do not use escaped LaTeX delimiters such as \\(...\\) or \\[...\\] in wiki pages.
- Do not leave raw LaTeX commands in normal prose. For example, write \`$-\\omega_r L_s i_{qs}^{r}$\`, not \`\\(-\\omega_r L_s i_{qs}^{r}\\)\` and not \`-\\omega_r L_s i_{qs}^{r}\`.
- If OCR or text extraction produces garbled math, do not paste it into the wiki.
- For formula-heavy slides/pages that cannot be confidently transcribed, copy the clean rendered page or figure into wiki/assets/<source-slug>/ and embed it near the explanation.
- The final wiki should never contain broken OCR-like equation text.

Linking:
- Create contextual links between wiki pages, not just a Related section.
- Use Obsidian-style wikilinks for in-body study links, such as \`[[motor-operating-region|motor operating region]]\`.
- Link only the first meaningful mention of a related concept in a section.
- Avoid turning every technical term into a link; choose links that help the reader branch to a canonical page.
- Keep Related sections compact as a backlink hub.
`;

  if (options.promptFile) {
    const promptFilePath = path.resolve(process.cwd(), options.promptFile);
    prompt += `\nAdditional operation instructions from ${promptFilePath}:\n\n`;
    prompt += await fsp.readFile(promptFilePath, "utf8");
    prompt += "\n";
  }

  if (options.extraInstruction) {
    prompt += `\nAdditional operation instruction:\n${options.extraInstruction}\n`;
  }

  prompt += `\nWorkspace path: ${workspace}\n`;
  return prompt;
}

function renderPreparedSourcesForPrompt(preparedSources) {
  if (!preparedSources.sources.length) return "";

  const lines = ["", "Prepared source artifacts:"];
  for (const source of preparedSources.sources) {
    lines.push(`- ${source.rawPath}`);
    if (source.textPath) lines.push(`  - Extracted text: ${source.textPath}`);
    if (source.sourceImage) lines.push(`  - Source image attached to this prompt: ${source.sourceImage}`);
    if (source.pageImages.length) {
      lines.push("  - Rendered page images attached to this prompt:");
      for (const image of source.pageImages) {
        lines.push(`    - ${image}`);
      }
    }
  }
  return lines.join("\n");
}

async function prepareSourceArtifacts(workspace, operationId) {
  const rawSources = await listRawSourceFiles(workspace);
  const prepared = {
    sources: [],
    imageAttachments: [],
  };

  for (const rawSource of rawSources) {
    if (isPromptImageSource(rawSource)) {
      const imagePath = safeJoin(workspace, rawSource);
      prepared.sources.push({
        rawPath: rawSource,
        sourceSlug: slugFromSourcePath(rawSource),
        textPath: "",
        manifestPath: "",
        sourceImage: rawSource,
        pageImages: [],
      });
      prepared.imageAttachments.push(imagePath);
      continue;
    }

    const lower = rawSource.toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isPptx = lower.endsWith(".pptx");
    if (!isPdf && !isPptx) continue;

    const sourceSlug = slugFromSourcePath(rawSource);
    const outputDir = path.join(workspace, ".studywiki", "extracted", operationId, sourceSlug);
    await ensureDir(outputDir);

    let pdfPath;
    let convertedFromPptx = false;
    if (isPdf) {
      pdfPath = safeJoin(workspace, rawSource);
    } else {
      const convertDir = path.join(outputDir, "converted");
      pdfPath = await convertPptxToPdf(safeJoin(workspace, rawSource), convertDir);
      convertedFromPptx = true;
    }

    const result = await renderPdfWithPdfKit(pdfPath, outputDir);
    const pageImages = result.pageImages.map((imagePath) => toPosixRelative(workspace, imagePath));

    prepared.sources.push({
      rawPath: rawSource,
      sourceSlug,
      textPath: toPosixRelative(workspace, result.textPath),
      manifestPath: toPosixRelative(workspace, result.manifestPath),
      pageImages,
      convertedFromPptx,
    });
    prepared.imageAttachments.push(...result.pageImages);
  }

  return prepared;
}

async function convertPptxToPdf(pptxPath, outputDir) {
  const sofficeCheck = checkSoffice();
  if (!sofficeCheck.installed) {
    throw new Error(
      `LibreOffice (soffice) is required to process .pptx files but was not found.\n` +
        `Install with: ${sofficeCheck.installCommand}\n` +
        `Or convert ${path.basename(pptxPath)} to PDF and re-add it to raw/.`,
    );
  }

  await ensureDir(outputDir);
  const result = spawnSync(
    "soffice",
    [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      pptxPath,
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 },
  );

  if (result.error) {
    throw new Error(`Failed to run soffice: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `soffice failed for ${pptxPath}\n${cleanCommandText(result.stderr || result.stdout)}`,
    );
  }

  const baseName = path.parse(pptxPath).name;
  const expectedPdfPath = path.join(outputDir, `${baseName}.pdf`);
  if (!(await exists(expectedPdfPath))) {
    throw new Error(
      `Expected converted PDF not found at ${expectedPdfPath}. soffice output:\n${cleanCommandText(
        result.stdout || result.stderr,
      )}`,
    );
  }

  return expectedPdfPath;
}

function isPromptImageSource(sourcePath) {
  return /\.(apng|avif|gif|jpe?g|png|webp)$/i.test(sourcePath);
}

async function renderPdfWithPdfKit(pdfPath, outputDir) {
  const swift = `
import Foundation
import PDFKit
import AppKit

let pdfPath = CommandLine.arguments[1]
let outputDir = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let pagesDir = outputDir.appendingPathComponent("pages", isDirectory: true)
try FileManager.default.createDirectory(at: pagesDir, withIntermediateDirectories: true)

guard let document = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
  fputs("Could not open PDF: \\(pdfPath)\\n", stderr)
  exit(2)
}

var textOutput = "# Extracted PDF Text\\n\\n"
var pages: [[String: Any]] = []
let targetWidth = 1600

for pageIndex in 0..<document.pageCount {
  guard let page = document.page(at: pageIndex) else { continue }
  let pageNumber = pageIndex + 1
  let pageText = page.string ?? ""
  textOutput += "## Page \\(pageNumber)\\n\\n"
  textOutput += pageText.isEmpty ? "(No extractable text.)\\n\\n" : pageText + "\\n\\n"

  let bounds = page.bounds(for: .mediaBox)
  let targetHeight = max(1, Int(round(Double(targetWidth) * Double(bounds.height / bounds.width))))
  guard let context = CGContext(
    data: nil,
    width: targetWidth,
    height: targetHeight,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    fputs("Could not create image context for page \\(pageNumber)\\n", stderr)
    exit(3)
  }

  context.setFillColor(NSColor.white.cgColor)
  context.fill(CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))
  context.saveGState()
  context.scaleBy(x: CGFloat(targetWidth) / bounds.width, y: CGFloat(targetHeight) / bounds.height)
  page.draw(with: .mediaBox, to: context)
  context.restoreGState()

  guard let cgImage = context.makeImage() else {
    fputs("Could not render page \\(pageNumber)\\n", stderr)
    exit(4)
  }
  let rep = NSBitmapImageRep(cgImage: cgImage)
  guard let png = rep.representation(using: .png, properties: [:]) else {
    fputs("Could not encode page \\(pageNumber)\\n", stderr)
    exit(5)
  }

  let filename = String(format: "page-%02d.png", pageNumber)
  let imageURL = pagesDir.appendingPathComponent(filename)
  try png.write(to: imageURL)
  pages.append([
    "page": pageNumber,
    "image": "pages/\\(filename)",
    "textChars": pageText.count
  ])
}

let textURL = outputDir.appendingPathComponent("text.md")
try textOutput.write(to: textURL, atomically: true, encoding: .utf8)

let manifest: [String: Any] = [
  "source": pdfPath,
  "pageCount": document.pageCount,
  "textPath": "text.md",
  "pages": pages
]
let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
try manifestData.write(to: outputDir.appendingPathComponent("manifest.json"))
print(outputDir.path)
`;

  const result = spawnSync("swift", ["-", pdfPath, outputDir], {
    input: swift,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });

  if (result.error) {
    throw new Error(`Failed to run PDFKit renderer: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `PDFKit renderer failed for ${pdfPath}\n${cleanCommandText(result.stderr || result.stdout)}`,
    );
  }

  const pagesDir = path.join(outputDir, "pages");
  const pageImages = (await fsp.readdir(pagesDir))
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => path.join(pagesDir, name));

  return {
    textPath: path.join(outputDir, "text.md"),
    manifestPath: path.join(outputDir, "manifest.json"),
    pageImages,
  };
}

function slugFromSourcePath(sourcePath) {
  const parsed = path.parse(sourcePath);
  let stem = parsed.name.toLowerCase();
  if (stem.endsWith(".pptx")) stem = stem.slice(0, -5);
  return (
    stem
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "source"
  );
}

async function listRawSourceFiles(workspace) {
  const rawRoot = path.join(workspace, "raw");
  const sources = [];
  if (!(await exists(rawRoot))) {
    return sources;
  }

  await walkFiles(workspace, rawRoot, async (_absolutePath, relPath) => {
    sources.push(relPath);
  });
  sources.sort();
  return sources;
}

async function createSnapshot(workspace, id) {
  const snapshotDir = path.join(workspace, ".studywiki", "snapshots", id);
  const treeDir = path.join(snapshotDir, "tree");
  const manifestPath = path.join(snapshotDir, "manifest.json");

  await ensureDir(treeDir);
  await copyFilteredDirectory(workspace, treeDir, workspace);
  const manifest = await buildManifest(workspace);
  await fsp.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        id,
        createdAt: new Date().toISOString(),
        ignoredPrefixes: RUNNER_METADATA_PREFIXES,
        files: manifest,
      },
      null,
      2,
    )}\n`,
  );

  return { id, dir: snapshotDir, treeDir, manifestPath, manifest };
}

async function diffSnapshot(workspace, snapshot) {
  const before = snapshot.manifest || (await readSnapshotManifest(snapshot.manifestPath));
  const after = await buildManifest(workspace);
  const paths = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  const changes = [];

  for (const relPath of paths) {
    const beforeFile = before[relPath];
    const afterFile = after[relPath];

    if (!beforeFile && afterFile) {
      changes.push({
        path: relPath,
        status: "added",
        before: null,
        after: afterFile,
      });
      continue;
    }

    if (beforeFile && !afterFile) {
      changes.push({
        path: relPath,
        status: "deleted",
        before: beforeFile,
        after: null,
      });
      continue;
    }

    if (beforeFile.sha256 !== afterFile.sha256 || beforeFile.kind !== afterFile.kind) {
      changes.push({
        path: relPath,
        status: "modified",
        before: beforeFile,
        after: afterFile,
      });
    }
  }

  return changes;
}

async function validateAndRestoreChanges(workspace, snapshot, changes) {
  const results = [];

  for (const change of changes) {
    const allowed = isAllowedPath(change.path, BUILD_WIKI_ALLOWED_PATHS);
    const result = {
      ...change,
      allowed,
      restored: false,
    };

    if (!allowed) {
      await restorePathFromSnapshot(workspace, snapshot.treeDir, change.path);
      result.restored = true;
    }

    results.push(result);
  }

  return results;
}

function isAllowedPath(relPath, allowedRules = BUILD_WIKI_ALLOWED_PATHS) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return false;

  return allowedRules.some((rule) => {
    if (rule.endsWith("/**")) {
      const prefix = rule.slice(0, -3);
      return normalized === prefix || normalized.startsWith(`${prefix}/`);
    }
    return normalized === rule;
  });
}

function getUserVisibleChangedFiles(changes) {
  return changes.filter((change) => {
    if (!change.allowed || change.restored) return false;
    return !isStudyWikiMetadataPath(change.path);
  });
}

function isStudyWikiMetadataPath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  return Boolean(normalized && normalized.startsWith(".studywiki/"));
}

function normalizeRelativePath(relPath) {
  if (!relPath || path.isAbsolute(relPath)) return null;
  const normalized = relPath.split(path.sep).join("/");
  const collapsed = path.posix.normalize(normalized);
  if (collapsed === "." || collapsed.startsWith("../") || collapsed === "..") return null;
  return collapsed;
}

async function buildManifest(workspace) {
  const entries = {};
  await walkFiles(workspace, workspace, async (absolutePath, relPath, stat) => {
    if (isRunnerMetadataPath(relPath)) return;

    if (stat.isSymbolicLink()) {
      const linkTarget = await fsp.readlink(absolutePath);
      entries[relPath] = {
        kind: "symlink",
        size: Buffer.byteLength(linkTarget),
        sha256: sha256(Buffer.from(linkTarget)),
        linkTarget,
      };
      return;
    }

    if (!stat.isFile()) return;

    const fileBuffer = await fsp.readFile(absolutePath);
    entries[relPath] = {
      kind: "file",
      size: stat.size,
      sha256: sha256(fileBuffer),
    };
  });

  return entries;
}

async function walkFiles(root, current, visitor) {
  const names = await fsp.readdir(current);
  names.sort();

  for (const name of names) {
    if (name === ".DS_Store") continue;

    const absolutePath = path.join(current, name);
    const relPath = toPosixRelative(root, absolutePath);
    if (isRunnerMetadataPath(relPath)) continue;

    const stat = await fsp.lstat(absolutePath);
    if (stat.isDirectory()) {
      await walkFiles(root, absolutePath, visitor);
    } else {
      await visitor(absolutePath, relPath, stat);
    }
  }
}

async function copyFilteredDirectory(sourceRoot, targetRoot, workspaceRoot) {
  await ensureDir(targetRoot);
  const names = await fsp.readdir(sourceRoot);
  names.sort();

  for (const name of names) {
    if (name === ".DS_Store") continue;

    const sourcePath = path.join(sourceRoot, name);
    const relPath = toPosixRelative(workspaceRoot, sourcePath);
    if (isRunnerMetadataPath(relPath)) continue;

    const targetPath = path.join(targetRoot, name);
    const stat = await fsp.lstat(sourcePath);

    if (stat.isDirectory()) {
      await copyFilteredDirectory(sourcePath, targetPath, workspaceRoot);
    } else if (stat.isSymbolicLink()) {
      const linkTarget = await fsp.readlink(sourcePath);
      await ensureDir(path.dirname(targetPath));
      await fsp.symlink(linkTarget, targetPath);
    } else if (stat.isFile()) {
      await ensureDir(path.dirname(targetPath));
      await fsp.copyFile(sourcePath, targetPath);
    }
  }
}

async function restorePathFromSnapshot(workspace, snapshotTreeDir, relPath) {
  const targetPath = safeJoin(workspace, relPath);
  const sourcePath = safeJoin(snapshotTreeDir, relPath);

  await fsp.rm(targetPath, { recursive: true, force: true });

  if (!(await exists(sourcePath))) {
    await removeEmptyParents(path.dirname(targetPath), workspace);
    return;
  }

  await copyPath(sourcePath, targetPath);
}

async function copyPath(sourcePath, targetPath) {
  const stat = await fsp.lstat(sourcePath);
  if (stat.isDirectory()) {
    await ensureDir(targetPath);
    const names = await fsp.readdir(sourcePath);
    for (const name of names) {
      await copyPath(path.join(sourcePath, name), path.join(targetPath, name));
    }
    return;
  }

  await ensureDir(path.dirname(targetPath));

  if (stat.isSymbolicLink()) {
    const linkTarget = await fsp.readlink(sourcePath);
    await fsp.symlink(linkTarget, targetPath);
    return;
  }

  await fsp.copyFile(sourcePath, targetPath);
}

async function removeEmptyParents(startDir, stopDir) {
  let current = path.resolve(startDir);
  const stop = path.resolve(stopDir);

  while (current.startsWith(stop) && current !== stop) {
    try {
      const entries = await fsp.readdir(current);
      if (entries.length > 0) return;
      await fsp.rmdir(current);
      current = path.dirname(current);
    } catch {
      return;
    }
  }
}

async function undoLastOperation(workspace) {
  await assertWorkspace(workspace);
  const markerPath = path.join(workspace, ".studywiki", "changed", "last-operation.json");
  if (!(await exists(markerPath))) {
    throw new Error("No last operation marker found. Run a build operation first.");
  }

  const marker = JSON.parse(await fsp.readFile(markerPath, "utf8"));
  if (!marker.reportPath) {
    throw new Error("Last operation marker does not point to an operation report.");
  }

  const reportPath = safeJoin(workspace, marker.reportPath);
  const report = JSON.parse(await fsp.readFile(reportPath, "utf8"));
  if (report.undoneAt) {
    throw new Error(`Operation ${report.id} was already undone at ${report.undoneAt}.`);
  }

  const snapshotTreeDir = safeJoin(workspace, path.join(report.snapshot.path, "tree"));
  const changedFiles = report.changedFiles || [];

  for (const change of changedFiles) {
    await restorePathFromSnapshot(workspace, snapshotTreeDir, change.path);
  }
  await ensureWorkspaceDirectories(workspace);

  const undoneAt = new Date().toISOString();
  const updatedReport = {
    ...report,
    undoneAt,
    undoSummary: {
      restoredPaths: changedFiles.map((change) => change.path),
    },
  };
  await fsp.writeFile(reportPath, `${JSON.stringify(updatedReport, null, 2)}\n`);
  await fsp.writeFile(
    path.join(path.dirname(reportPath), "undo.json"),
    `${JSON.stringify(
      {
        operationId: report.id,
        undoneAt,
        restoredPaths: changedFiles.map((change) => change.path),
      },
      null,
      2,
    )}\n`,
  );
  await fsp.writeFile(
    markerPath,
    `${JSON.stringify(
      {
        operationId: report.id,
        undoneAt,
        changedFiles: [],
        note: "Last operation was undone; no files are currently marked as changed by it.",
      },
      null,
      2,
    )}\n`,
  );
  await fsp.writeFile(
    path.join(workspace, ".studywiki", "changed", "last-operation.txt"),
    `Operation ${report.id} was undone at ${undoneAt}.\n`,
  );

  console.log(`Undid operation ${report.id}. Restored ${changedFiles.length} paths.`);
}

async function cancelRunningOperation(workspace) {
  const markerPath = path.join(workspace, RUNNING_MARKER_PATH);
  if (!(await exists(markerPath))) {
    console.log("No running operation to cancel.");
    return;
  }
  const marker = JSON.parse(await fsp.readFile(markerPath, "utf8"));
  const pid = marker.pid;
  if (typeof pid !== "number") {
    throw new Error("Running marker has no valid PID.");
  }
  if (marker.operationId) {
    const flagPath = path.join(
      workspace,
      ".studywiki",
      "operations",
      marker.operationId,
      "cancel-requested.flag",
    );
    try {
      await ensureDir(path.dirname(flagPath));
      await fsp.writeFile(
        flagPath,
        JSON.stringify({ requestedAt: new Date().toISOString() }, null, 2),
      );
    } catch (_e) {}
  }
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to pid ${pid}`);
  } catch (error) {
    if (error.code === "ESRCH") {
      try {
        await fsp.unlink(markerPath);
      } catch (_e) {}
      console.log(`Process ${pid} already exited; cleared stale marker.`);
      return;
    }
    throw error;
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < 3000) {
    try {
      process.kill(pid, 0);
      await new Promise((r) => setTimeout(r, 200));
    } catch (_error) {
      console.log(`Process ${pid} exited.`);
      return;
    }
  }
  try {
    process.kill(pid, "SIGKILL");
    console.log(`Sent SIGKILL to pid ${pid}`);
  } catch (_error) {}
}

async function printRunningProgress(workspace) {
  const markerPath = path.join(workspace, RUNNING_MARKER_PATH);
  if (!(await exists(markerPath))) {
    console.log(JSON.stringify({ running: false }, null, 2));
    return;
  }
  let marker;
  try {
    marker = JSON.parse(await fsp.readFile(markerPath, "utf8"));
  } catch (error) {
    console.log(JSON.stringify({ running: false, error: error.message }, null, 2));
    return;
  }
  let alive = false;
  try {
    process.kill(marker.pid, 0);
    alive = true;
  } catch (_error) {}
  const eventsPath = marker.operationId
    ? path.join(workspace, ".studywiki", "operations", marker.operationId, "events.jsonl")
    : null;
  let events = "";
  if (eventsPath && (await exists(eventsPath))) {
    events = await fsp.readFile(eventsPath, "utf8");
  }
  console.log(
    JSON.stringify(
      {
        running: alive,
        marker,
        events,
      },
      null,
      2,
    ),
  );
}

async function printInterruptedOperation(workspace) {
  const opsDir = path.join(workspace, ".studywiki", "operations");
  if (!(await exists(opsDir))) {
    console.log(JSON.stringify({ interrupted: false }, null, 2));
    return;
  }
  const entries = (await fsp.readdir(opsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (entries.length === 0) {
    console.log(JSON.stringify({ interrupted: false }, null, 2));
    return;
  }
  const latest = entries[entries.length - 1];
  const opDir = path.join(opsDir, latest);
  if (
    (await exists(path.join(opDir, "report.json"))) ||
    !(await exists(path.join(opDir, "prompt.md")))
  ) {
    console.log(JSON.stringify({ interrupted: false }, null, 2));
    return;
  }
  const markerPath = path.join(workspace, RUNNING_MARKER_PATH);
  if (await exists(markerPath)) {
    try {
      const marker = JSON.parse(await fsp.readFile(markerPath, "utf8"));
      try {
        process.kill(marker.pid, 0);
        console.log(JSON.stringify({ interrupted: false, currentlyRunning: true }, null, 2));
        return;
      } catch (_error) {}
    } catch (_error) {}
  }
  const stat = await fsp.stat(opDir);
  console.log(
    JSON.stringify(
      {
        interrupted: true,
        operationId: latest,
        startedAt: stat.birthtime.toISOString(),
      },
      null,
      2,
    ),
  );
}

async function discardInterruptedOperation(workspace) {
  const markerPath = path.join(workspace, RUNNING_MARKER_PATH);
  if (await exists(markerPath)) {
    try {
      await fsp.unlink(markerPath);
    } catch (_e) {}
  }
  const opsDir = path.join(workspace, ".studywiki", "operations");
  if (!(await exists(opsDir))) {
    console.log("No operations to discard.");
    return;
  }
  const entries = (await fsp.readdir(opsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (entries.length === 0) {
    console.log("No operations to discard.");
    return;
  }
  const latest = entries[entries.length - 1];
  const opDir = path.join(opsDir, latest);
  const reportPath = path.join(opDir, "report.json");
  if (await exists(reportPath)) {
    console.log("Latest operation has a report; nothing to discard.");
    return;
  }
  const snapshotDir = path.join(workspace, ".studywiki", "snapshots", latest);
  const snapshotTreeDir = path.join(snapshotDir, "tree");
  let restored = 0;
  if (await exists(snapshotTreeDir)) {
    const snapshot = {
      id: latest,
      dir: snapshotDir,
      manifestPath: path.join(snapshotDir, "manifest.json"),
    };
    const changes = await diffSnapshot(workspace, snapshot);
    for (const change of changes) {
      await restorePathFromSnapshot(workspace, snapshotTreeDir, change.path);
      restored += 1;
    }
    await ensureWorkspaceDirectories(workspace);
  }
  await fsp.writeFile(
    reportPath,
    `${JSON.stringify(
      {
        id: latest,
        type: "build-wiki",
        status: "interrupted_and_discarded",
        completedAt: new Date().toISOString(),
        restoredPaths: restored,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `Discarded interrupted operation ${latest}; restored ${restored} path(s) from snapshot.`,
  );
}

async function printStatus(workspace) {
  await assertWorkspace(workspace);
  const markerPath = path.join(workspace, ".studywiki", "changed", "last-operation.json");
  const marker = (await exists(markerPath))
    ? JSON.parse(await fsp.readFile(markerPath, "utf8"))
    : null;
  const manifest = await buildManifest(workspace);

  console.log(
    JSON.stringify(
      {
        workspace,
        fileCount: Object.keys(manifest).length,
        lastOperation: marker,
      },
      null,
      2,
    ),
  );
}

async function writeChangedMarkers(workspace, report, reportPath, reportMarkdownPath) {
  const changedDir = path.join(workspace, ".studywiki", "changed");
  await ensureDir(changedDir);

  const marker = {
    operationId: report.id,
    status: report.status,
    completedAt: report.completedAt,
    reportPath: path.relative(workspace, reportPath),
    reportMarkdownPath: path.relative(workspace, reportMarkdownPath),
    changedFiles: (report.userVisibleChangedFiles || report.changedFiles).map((change) => ({
      path: change.path,
      status: change.status,
      allowed: change.allowed,
      restored: change.restored,
    })),
  };

  await fsp.writeFile(
    path.join(changedDir, "last-operation.json"),
    `${JSON.stringify(marker, null, 2)}\n`,
  );
  await fsp.writeFile(path.join(changedDir, "last-operation.txt"), renderChangedText(marker));
}

async function normalizeGeneratedMarkdownFiles(workspace) {
  const relativePaths = ["index.md", "schema.md"];
  const wikiRoot = path.join(workspace, "wiki");

  if (await exists(wikiRoot)) {
    await walkFiles(workspace, wikiRoot, async (_absolutePath, relativePath) => {
      if (relativePath.toLowerCase().endsWith(".md")) {
        relativePaths.push(relativePath);
      }
    });
  }

  for (const relativePath of relativePaths) {
    const absolutePath = safeJoin(workspace, relativePath);
    if (!(await exists(absolutePath))) continue;

    const original = await fsp.readFile(absolutePath, "utf8");
    const normalized = normalizeMarkdownMathDelimiters(original);
    if (normalized !== original) {
      await fsp.writeFile(absolutePath, normalized);
    }
  }
}

function normalizeMarkdownMathDelimiters(markdown) {
  return transformMarkdownOutsideCodeFences(markdown, (segment) =>
    segment
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression) => `$$\n${expression.trim()}\n$$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression) => `$${expression.trim()}$`),
  );
}

function transformMarkdownOutsideCodeFences(markdown, transform) {
  return markdown
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part) => {
      if (part.startsWith("```") || part.startsWith("~~~")) {
        return part;
      }
      return transform(part);
    })
    .join("");
}

function renderChangedText(marker) {
  const lines = [
    `Operation: ${marker.operationId}`,
    `Status: ${marker.status}`,
    `Completed: ${marker.completedAt}`,
    `Report: ${marker.reportMarkdownPath}`,
    "",
    "Changed files:",
  ];

  if (marker.changedFiles.length === 0) {
    lines.push("- none");
  } else {
    for (const change of marker.changedFiles) {
      const permission = change.allowed ? "allowed" : "forbidden/restored";
      lines.push(`- ${change.status} ${permission}: ${change.path}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderReportMarkdown(report) {
  const lines = [
    `# Operation Report: ${report.id}`,
    "",
    `- Type: ${report.type}`,
    `- Status: ${report.status}`,
    `- Started: ${report.startedAt}`,
    `- Completed: ${report.completedAt}`,
    `- Codex exit code: ${report.codex.exitCode}`,
    `- Snapshot: ${report.snapshot.path}`,
    "",
  ];

  if (report.status === "completed_without_wiki_content") {
    lines.push(
      "> Warning: Codex exited cleanly but no wiki page or index/log update was produced.",
      "> The build did not finish in a meaningful way.",
      "",
    );
    if (report.completionCheck) {
      const cc = report.completionCheck;
      lines.push("Completion check:");
      lines.push(
        `- Wiki content under \`${cc.requiredCategories.join("`, `")}\`: ${
          cc.wikiContentChanged ? "changed" : "no changes"
        }`,
      );
      lines.push(
        `- Bookkeeping (\`${cc.requiredBookkeeping.join("`, `")}\`): ${
          cc.indexOrLogTouched ? "updated" : "not updated"
        }`,
      );
      lines.push("");
    }
  }

  lines.push("## User-Visible Changed Files", "");

  const userVisibleChangedFiles = report.userVisibleChangedFiles || report.changedFiles;
  if (userVisibleChangedFiles.length === 0) {
    lines.push("No user-visible changed files were detected.");
  } else {
    lines.push("| Status | Path |");
    lines.push("| --- | --- |");
    for (const change of userVisibleChangedFiles) {
      lines.push(`| ${change.status} | \`${change.path}\` |`);
    }
  }

  lines.push(
    "",
    "## Changed Files",
    "",
  );

  if (report.changedFiles.length === 0) {
    lines.push("No changed files were detected.");
  } else {
    lines.push("| Status | Permission | Restored | Path |");
    lines.push("| --- | --- | --- | --- |");
    for (const change of report.changedFiles) {
      lines.push(
        `| ${change.status} | ${change.allowed ? "allowed" : "forbidden"} | ${
          change.restored ? "yes" : "no"
        } | \`${change.path}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## Allowed Path Rules");
  lines.push("");
  for (const rule of report.allowedPathRules) {
    lines.push(`- \`${rule}\``);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function assertWorkspace(workspace) {
  const required = ["raw", "index.md", "log.md", "schema.md", "AGENTS.md"];
  for (const relPath of required) {
    if (!(await exists(path.join(workspace, relPath)))) {
      throw new Error(
        `${workspace} is missing ${relPath}. Run create-sample first or choose a compatible workspace.`,
      );
    }
  }
  await ensureWorkspaceDirectories(workspace);
}

async function ensureWorkspaceDirectories(workspace) {
  for (const relPath of WORKSPACE_DIRECTORIES) {
    await ensureDir(path.join(workspace, relPath));
  }
}

async function readSnapshotManifest(manifestPath) {
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  return manifest.files || {};
}

function isRunnerMetadataPath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return true;
  return RUNNER_METADATA_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function safeJoin(root, relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) {
    throw new Error(`Unsafe relative path: ${relPath}`);
  }

  const rootPath = path.resolve(root);
  const targetPath = path.resolve(rootPath, normalized);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`Path escapes workspace: ${relPath}`);
  }
  return targetPath;
}

function toPosixRelative(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function writeFileIfMissing(filePath, content) {
  if (await exists(filePath)) return;
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, content);
}

function cleanCommandText(text) {
  return text ? text.trim() : "";
}

function createOperationId() {
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${iso}-${suffix}`;
}

module.exports = {
  BUILD_WIKI_ALLOWED_PATHS,
  normalizeRelativePath,
  isAllowedPath,
  isRunnerMetadataPath,
  normalizeMarkdownMathDelimiters,
  parseArgs,
};

if (require.main === module) {
  main();
}
