# Maple Public Wiki Viewer

Standalone Vercel app for publishing a Maple workspace snapshot.

Generate the robot hardware snapshot from the local workspace:

```bash
MAPLE_WORKSPACE_PATH=/Users/ahnchulwoo/robot-hardware-wiki npm run build:snapshot
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

The current snapshot policy publishes all workspace sources by default. Source
links in wiki pages are rewritten to `/published-sources/...`, so citations can
open the original PDF, Markdown, or text file from the web viewer.
