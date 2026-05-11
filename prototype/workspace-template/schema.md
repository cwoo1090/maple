# Workspace Wiki Schema

This file defines durable content conventions for this workspace.
The wiki is a local, file-based knowledge graph compiled from immutable sources and explicit wiki update operations.

The goal is to maintain a persistent, compounding wiki that sits between the reader and the raw sources. New sources should strengthen the existing wiki instead of forcing future questions to rediscover the same knowledge from scratch.

## Workspace Context

- Use this section to capture durable context for this specific wiki, including subject, audience, scope, tone, and recurring preferences.
- Keep the title and opening section about this wiki or workspace, not about the app that manages it.
- If no workspace-specific context has been provided yet, keep this section concise and update it when the user gives durable context.

## Workspace Structure

```text
workspace/
  sources/                # Human-curated sources; never edit source contents
  wiki/
    concepts/             # Canonical concept pages, one durable idea per file
    summaries/            # Source digests for substantial source units
    guides/               # Useful routes across multiple wiki pages
    assets/               # Derived figures extracted or generated for wiki pages
  index.md                # Reader-facing catalog and navigation map
  log.md                  # Append-only history of wiki operations
  schema.md               # This file; durable wiki conventions
```

## Working Model

- `sources/` stores immutable source material.
- `wiki/` stores generated and maintained wiki pages.
- `schema.md` stores durable wiki conventions and operation rules.
- Explore Chat is read-only; write operations update the wiki only when explicitly invoked by the app.
- Build Wiki compiles source changes into the existing wiki; it should not merely index files or create disconnected summaries.
- Apply to Wiki turns useful Explore answers into durable wiki improvements.
- Wiki healthcheck is the lint pass for the wiki; it applies the Wiki Healthcheck Rules below and fixes only conservative issues.
- Keep one canonical page per durable concept and link to it instead of repeating the full explanation elsewhere.
- `index.md` is for navigation. `log.md` records operation history and is not the source of truth for wiki facts.

## Operation Model

The workspace should preserve this loop:

```text
sources/ -> Build Wiki -> Explore -> Apply to Wiki -> Wiki Healthcheck -> Update Rules
```

- Build Wiki ingests sources and integrates them into the existing wiki.
- Explore answers from the compiled wiki first.
- Apply to Wiki saves reusable Explore insights back into the wiki.
- Wiki healthcheck applies the rules in `## Wiki Healthcheck Rules`.
- Improve Wiki handles subjective restructuring, synthesis, and page-quality work.
- Organize Sources moves or renames source files without changing their contents.
- Update Rules changes durable conventions in this schema.
- Any write operation may update durable rules only when the user explicitly asks to remember a future rule, workspace preference, or operation behavior.

## Build Wiki Rules

Build Wiki should integrate scoped source changes into the current wiki:

- Read scoped sources first, then inspect existing wiki pages when they may be updated by the new source.
- Do not rely only on extracted text for visually meaningful sources.
- For slides, worked solutions, derivations, diagrams, screenshots, or image-heavy material, inspect rendered page or slide images when needed to understand the source.
- Choose a sufficient visual inspection set for the material type; text-heavy sources may need few images, while visual or step-by-step sources may need more.
- Distinguish pages inspected for understanding from images embedded in the final wiki.
- Create source summaries only for substantial source units.
- Create or update concept pages for reusable ideas, entities, equations, processes, comparisons, or definitions.
- Prefer updating existing canonical pages over creating duplicates.
- When a new source changes, refines, or contradicts an existing claim, update the relevant page and note the source relationship.
- Add wikilinks where they help future readers move between connected ideas.
- Preserve useful uncertainty and conflicts instead of smoothing them away.
- Update `index.md` after page additions, removals, renames, or major navigation changes.
- Append a concise dated entry to `log.md`.
- Update `schema.md` only when the user explicitly asks for durable rule or convention changes.

## Explore And Apply Rules

Explore Chat is read-only by default:

- Use `index.md` first to locate relevant wiki pages.
- Answer from the local wiki before reading raw sources.
- Read sources only when the compiled wiki is incomplete, ambiguous, or needs source-level verification.
- If web search is enabled, label web-derived claims and cite URLs near the claim.
- Do not imply web results are curated local sources unless they have been explicitly captured under `sources/`.

Apply to Wiki should save durable value from Explore:

- Do not dump the chat transcript into the wiki.
- Preserve reusable explanations, corrected concepts, comparisons, guides, formulas, source-grounded answers, and useful open questions.
- Update existing pages when the answer belongs there.
- Create a new page only when the answer is worth finding later as a concept, guide, synthesis, or reference.
- Cite local source paths or web references as appropriate.
- Update `index.md` and append to `log.md` when navigation or content changes.

## Durable Preferences And Agent Files

- Treat this `schema.md` file as the durable source of truth for wiki rules, workspace preferences, and operation behavior.
- Keep `schema.md` written as workspace guidance, not product documentation; do not include app branding or marketing copy.
- Save a user preference to `schema.md` only when the user explicitly asks for future behavior, for example "always", "from now on", "remember this", "make this the default", or "for this workspace".
- Otherwise, treat user instructions as local to the current operation.
- `AGENTS.md` and `CLAUDE.md` are short bootstrap files for AI tools. Keep detailed content conventions in `schema.md`.
- Update `AGENTS.md` or `CLAUDE.md` only when the user explicitly asks for agent behavior, bootstrap, or operation-boundary changes.
- If `schema.md` and an agent bootstrap file overlap, keep the agent bootstrap file short and point it back to `schema.md`.

## Page Types

- Summary pages live under `wiki/summaries/` and capture substantial source units.
- Concept pages live under `wiki/concepts/` and explain one reusable idea.
- Guide pages live under `wiki/guides/` and create useful routes across multiple wiki pages.
- Do not create mechanical summaries for every small file when concepts, guides, or citations represent the source better.
- Do not create mechanical guide pages for every source or concept; use guides for overviews, learning paths, review paths, onboarding, or synthesis.

## Page Standards

Use YAML frontmatter for generated wiki pages:

```yaml
---
sources:
  - sources/sample-note.md
created: 2026-05-03
updated: 2026-05-03
---
```

- Keep frontmatter minimal: `sources`, `created`, and `updated` only unless the user changes this schema.
- Do not repeat page-level metadata as a visible `Source: ... Created: ... Updated: ...` paragraph after the title; the app renders frontmatter as the page header.
- Use the first `#` heading as the page title. Use the page folder for page type.
- Use `YYYY-MM-DD` dates. Preserve `created` after first creation and refresh `updated` when page content changes.
- Use `kebab-case.md` filenames.
- Prefer one concept per page. Split pages that mix durable ideas.
- Write for a non-technical individual or team member.
- Prefer short sections, concrete examples, and source-grounded synthesis over copy-paste.

## Cross-References

- Use Obsidian-style wikilinks such as `[[retrieval-practice]]` or `[[retrieval-practice|retrieval practice]]`.
- In concept pages, link the first meaningful in-body mention where a reader may want to branch.
- In guide pages, keep reading order clear and avoid repeating navigation prose already handled by concept links.
- Do not over-link repeated terms in the same short section.
- Keep `Related` sections compact; they should not be the only place important concepts connect.

## Math Formatting

- Use `$...$` for short inline variables or expressions.
- Use `$$...$$` display blocks for important equations, derivations, fractions, or chained equality.
- Inside math, prefer LaTeX notation such as `\frac{...}{...}`, `\sqrt{...}`, `^2`, and `\times`.
- Do not use escaped LaTeX delimiters like `\(...\)` or `\[...\]` in wiki pages.

## Source Citations

- Frontmatter `sources` lists the source files that contributed to a page.
- Summaries must cite their source file path.
- Concept and guide pages should list all contributing source paths.
- For high-risk claims, cite the exact source span near the claim when available.
- High-risk claims include equations, derivations, numerical values, component specs, slide corrections, and convention-dependent definitions.
- Use compact source notes with clickable Markdown links to local source files.
- When an exact page, slide, line range, or section is known, include that locator in the visible link label and in the link target fragment when the wiki viewer supports it.
- Do not write citations where the link label is only the source file and the exact locator is left outside the link, such as `[source.pdf](source.pdf#page=15), page 15`; prefer `[source.pdf, page 15](source.pdf#page=15)`.
- If a source path contains spaces or punctuation, wrap the link destination in angle brackets, for example: _Source: [sources/taegu lecture_2.txt, lines 15-17](<sources/taegu lecture_2.txt#L15-L17>)._
- Supported local source anchors:
  - PDF pages: use `#page=N`, for example _Source: [sources/Lec5.pdf, page 15](sources/Lec5.pdf#page=15)._
  - PowerPoint or slide-derived PDFs: use `#slide=N`, for example _Source: [sources/Lec5.pptx, slide 15](sources/Lec5.pptx#slide=15)._
  - TXT line ranges: use `#Lstart-Lend`, for example _Source: [sources/lecture-03.txt, lines 15-17](sources/lecture-03.txt#L15-L17)._
  - Markdown source sections: use heading anchors when the relevant passage sits under a stable heading, for example _Source: [sources/lecture-03-notes.md, attention mechanism section](sources/lecture-03-notes.md#attention-mechanism)._
- For PDF page ranges or slide ranges, link to the first page or slide in the range and describe the full range in the visible link label.
- For TXT source ranges, include the full line range in both the visible link label and the link anchor.
- Do not use `#L...` line anchors on Markdown source files unless the wiki viewer explicitly supports line anchors for rendered Markdown sources; use a heading anchor or a visible locator instead.
- If no reliable page, slide, line, or heading target exists, cite the source file and add a short visible locator such as section title, timestamp, paragraph, or surrounding phrase.
- Prefer linking to the original imported source under `sources/`; do not cite generated preview/cache files such as `.pptx.pdf` unless that file is itself an imported source.
- Do not use bare code-formatted source paths for inline source notes; they render as text and are not clickable.
- Web references are external links used during Explore Chat; they are not curated source files and must not be added to frontmatter `sources`.
- If web-derived content is applied to the wiki, cite it inline or in a `## Web References` section with title, URL, access date, and `found via Explore web search`.

## Visuals And Assets

- Use visuals when they materially clarify a concept, equation, architecture, plot, or comparison.
- Keep `sources/` immutable. Save extracted or cropped derived images under `wiki/assets/<source-slug>/`.
- Place visuals near the explanation they support and include a short caption with source path/page when possible.
- Do not add decorative images or dump every source or inspected image into the wiki; embed only the smallest useful set.

## Uncertainty, Conflicts, And Knowledge Gaps

- When uncertain, flag the gap with an Obsidian question callout:

> [!question]
> State what is uncertain and what source would resolve it.

- When sources conflict, flag both claims with an Obsidian warning callout:

> [!warning]
> Note the conflicting claims and their sources.

- If an important concept is mentioned repeatedly but lacks a page, create the page during Build Wiki or report it during Wiki healthcheck.
- If a useful answer requires missing evidence, record the missing source or research question instead of guessing.
- Healthcheck may suggest source gaps or research questions, but should not fabricate answers.

## Index And Log Rules

- Update `index.md` after wiki pages are added, removed, renamed, or reorganized.
- Keep `index.md` grouped by page type with short descriptions.
- Include enough one-line context for each page so readers and AI operations can choose relevant pages without opening everything.
- Treat `log.md` as append-only operation history.
- Append a concise dated entry to `log.md` after Build Wiki, Apply-to-Wiki updates, healthchecks, organization changes, and rules updates.
- Use this format for operation entries when adding more than a single bullet:

```md
## [2026-05-03] build-wiki | Lecture 3 actuator modeling

- Sources: `sources/lecture-03.pdf`, `sources/lecture-03-notes.md`
- Changed: summaries, concepts, guide, index
- Notes: left motor-selection tradeoffs as an open question
```

- Use a single dated bullet only for tiny bookkeeping updates.

## Wiki Healthcheck Rules

If this section is missing or empty, Wiki healthcheck should stop and report that Update Rules is needed. Do not invent durable healthcheck rules during a healthcheck run.

Wiki healthcheck should conservatively check and fix:

- Broken wikilinks when the intended target is obvious; report ambiguous links instead of guessing.
- Orphan pages that can be connected naturally from `index.md`, guides, or related concept pages.
- Important concepts mentioned across multiple pages that lack their own canonical page.
- Stale `index.md` entries and missing important pages.
- Summary pages that do not cite their source.
- Concept pages that make source-specific claims without source citations.
- Source citations that are not clickable Markdown links to local source files.
- Source citations where a known exact locator is missing from the visible link label, left only as plain text after the link, or absent from a supported link fragment such as `#page=N`, `#slide=N`, `#Lstart-Lend`, or a Markdown heading anchor.
- Broken local source links or source links that point to generated preview/cache files instead of imported files under `sources/`.
- Web URLs incorrectly listed in frontmatter `sources`; remove them from frontmatter and cite them as web references instead.
- Web-derived claims that lack inline URL citations or a `## Web References` entry with title, URL, access date, and `found via Explore web search`.
- Duplicate concept pages only when they are clearly duplicative; otherwise add cross-links.
- Empty, very short, or vague pages using only existing wiki/source evidence.
- Contradictions between pages, especially when newer sources supersede older claims.
- Unresolved question or warning callouts that can now be answered from existing sources.
- Broken image references and captions that lack original source paths when known.
- `log.md` entries that are missing for recent wiki-changing operations.
- A short `log.md` entry after the healthcheck.

Wiki healthcheck should not make major subjective improvements or restructures; use Improve Wiki for that.
Wiki healthcheck should not create or change durable rules unless the user explicitly asks to remember a future rule, workspace preference, or operation behavior; use Update Rules for rule-only changes.
Never edit source file contents.
