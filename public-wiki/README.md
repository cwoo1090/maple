# Maple Public Wiki Viewer

Standalone Vercel app for publishing a Maple workspace snapshot.

Generate a public snapshot from a local Maple workspace:

```bash
MAPLE_WORKSPACE_PATH=/path/to/maple-workspace npm run build:snapshot
```

Run locally:

```bash
npm run dev
```

Chat service environment:

```bash
CHAT_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
```

The chat UI sends published wiki chunks by default. When the globe button is
enabled, the API also allows Gemini Google Search grounding for questions that
need current or external context.

Deploy:

```bash
vercel --prod
```

From Maple's Share & Publish flow, `Publish & push` writes a deployable viewer
to `public-site/` inside the team repo. In Vercel, import the GitHub repo and
set the project Root Directory to `public-site`; the normal build command is
`npm run build` and the output directory is `dist`.

The default snapshot policy keeps original workspace sources private. The public
site includes accepted wiki pages and referenced `wiki/assets` files only.

To publish sources publicly for a specific workspace, enable it from Maple's
Share & Publish screen or set `.aiwiki/publish.json`:

```json
{
  "schemaVersion": 1,
  "publicSources": true
}
```

When source publishing is enabled, source links in wiki pages are rewritten to
`/published-sources/...`, so citations can open the original PDF, Markdown, or
text file from the web viewer.
