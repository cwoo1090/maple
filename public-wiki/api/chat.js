import fs from "node:fs/promises";
import path from "node:path";

const rateLimit = new Map();
let cachedData = null;
const CHAT_CONTEXT_HIT_LIMIT = 8;
const CHAT_CONTEXT_CHUNK_LIMIT = 18;
const CHAT_CONTEXT_NEIGHBOR_RADIUS = 1;
const CHAT_CONTEXT_CHAR_LIMIT = 11000;
const WHOLE_WIKI_GLOBAL_DOC_CHAR_LIMIT = 36000;
const AGENT_MAX_READ_STEPS = 3;
const AGENT_MAX_ACTIONS_PER_STEP = 4;
const AGENT_PAGE_READ_CHAR_LIMIT = 18000;
const AGENT_SECTION_READ_CHAR_LIMIT = 1600;
const AGENT_OBSERVATION_CHAR_LIMIT = 52000;
const AGENT_PLANNER_OUTPUT_TOKENS = 700;
const AGENT_FINAL_OUTPUT_TOKENS = 1600;
const CHAT_HISTORY_LIMIT = 6;
const CHAT_HISTORY_TEXT_LIMIT = 1600;
const CURRENT_PAGE_IMAGE_LIMIT = 4;
const CURRENT_PAGE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const CURRENT_PAGE_IMAGE_TOTAL_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_CHAT_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
];
const CHAT_SYSTEM_PROMPT =
  [
    "You are Ask Wiki, a read-only guide for a published Maple wiki.",
    "Use the read-only wiki context gathered by the server-side wiki reader; the app renders local wiki references below your answer, so do not put local context markers like [1] or [2, 3] in the answer body.",
    "If context is insufficient, say what is missing instead of guessing.",
    "If web search is enabled, use it only when the local published context is missing current or external facts, and use bracketed numeric citations only for web-derived claims.",
    "When current-page images are attached, treat them as visual evidence from the selected wiki page only.",
    "Do not claim you edited, built, or updated the wiki.",
    "Use concise technical prose. Format equations with Markdown math delimiters.",
    "Do not invent citation numbers, URLs, or source names.",
    "Return clean Markdown for a narrow chat panel: short paragraphs, bullets for lists, sparse bold for key terms, and no raw HTML or code-fenced full answer.",
  ].join(" ");

export default async function handler(req, res) {
  if (req.method === "GET") {
    const chatConfig = resolveChatConfig();
    return res.status(200).json(publicChatConfig(chatConfig));
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (!allowRequest(ip)) {
    return res.status(429).json({ error: "Too many chat requests. Try again later." });
  }

  const body = await readBody(req);
  const question = String(body.question || "").trim();
  const pageKey = String(body.pageKey || "index").trim();
  const scope = body.scope === "current" ? "current" : "wiki";
  const history = parseChatHistory(body.history);
  const chatConfig = resolveChatConfig({ requestedModel: body.model });
  const webSearch = body.webSearch === true && chatConfig.webSearchSupported;

  if (!question || question.length > 1000) {
    return res.status(400).json({ error: "Question must be between 1 and 1000 characters." });
  }

  const data = await loadChatData();
  const contextResult = buildChatContext(data, { question, pageKey, scope });
  const currentPageImages =
    scope === "current"
      ? await loadCurrentPageImages(contextResult.selectedPage, question, req)
      : [];
  const contextSummary = {
    ...contextResult.summary,
    imageCount: currentPageImages.length,
  };
  const { chunks, context } = contextResult;
  if (!contextResult.hasContext && !currentPageImages.length && !webSearch) {
    return res.status(200).json({
      answer: "I could not find enough public wiki context to answer that.",
      references: [],
      context: contextSummary,
    });
  }

  let result;
  try {
    result = await answerWithGemini({
      data,
      question,
      context,
      chunks,
      history,
      scope,
      selectedPage: contextResult.selectedPage,
      images: currentPageImages,
      webSearch,
      model: chatConfig.model,
    });
  } catch (error) {
    return res.status(error.statusCode || 502).json({
      error: error.message || "Chat request failed.",
    });
  }

  const webReferences = result.references || [];
  const localReferences = renumberLocalReferencesAfter(
    result.localReferences || contextReferences(chunks),
    webReferences.length,
  );
  const references =
    webSearch && webReferences.length
      ? [...webReferences, ...localReferences]
      : [...localReferences, ...webReferences];
  return res.status(200).json({
    answer: result.answer,
    references,
    model: result.model,
    provider: chatConfig.provider,
    modelLabel: chatConfig.modelLabel,
    webSearch: result.webSearch,
    webSearchSupported: chatConfig.webSearchSupported,
    models: chatConfig.models,
    context: contextSummary,
  });
}

function resolveChatConfig({ requestedModel = "" } = {}) {
  const genericModel = cleanEnv(process.env.CHAT_MODEL);
  const geminiModel = cleanEnv(process.env.GEMINI_MODEL);
  let modelOptions = chatModelOptions();
  const envModel = [geminiModel, genericModel].find(isGeminiModel) || "";

  if (envModel && !modelOptions.includes(envModel)) {
    modelOptions = [envModel, ...modelOptions];
  }
  const requestedGeminiModel = isGeminiModel(requestedModel) ? requestedModel : "";
  const model = normalizeRequestedModel(requestedGeminiModel, envModel, modelOptions);

  return {
    provider: "gemini",
    model,
    modelLabel: modelLabel(model, "gemini"),
    webSearchSupported: true,
    models: modelOptions.map((option) => modelOption(option)),
  };
}

function publicChatConfig(config) {
  return {
    provider: config.provider,
    model: config.model,
    modelLabel: config.modelLabel,
    webSearchSupported: config.webSearchSupported,
    models: config.models,
  };
}

function chatModelOptions() {
  const configured = cleanEnv(process.env.CHAT_MODELS)
    .split(",")
    .map((model) => model.trim())
    .filter(isGeminiModel);
  const options = configured.length ? configured : DEFAULT_CHAT_MODELS;
  return [...new Set(options)];
}

function normalizeRequestedModel(requestedModel, fallbackModel, modelOptions) {
  const requested = cleanEnv(requestedModel);
  if (requested && modelOptions.includes(requested)) return requested;
  if (fallbackModel && modelOptions.includes(fallbackModel)) return fallbackModel;
  if (fallbackModel) return fallbackModel;
  return modelOptions[0] || "gemini-3.1-flash-lite";
}

function modelOption(model) {
  return {
    model,
    provider: "gemini",
    label: modelLabel(model, "gemini"),
    webSearchSupported: true,
  };
}

function cleanEnv(value) {
  return String(value || "").trim();
}

function isGeminiModel(model) {
  return inferProviderFromModel(model) === "gemini";
}

function inferProviderFromModel(model) {
  const normalized = cleanEnv(model).replace(/^models\//, "");
  if (/^gemini(?:-|$)/i.test(normalized)) return "gemini";
  return "";
}

function modelLabel(model, provider) {
  const cleanModel = cleanEnv(model).replace(/^models\//, "");
  if (!cleanModel) return provider === "gemini" ? "Gemini" : "AI";

  return cleanModel
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^(ai|api)$/i.test(part)) return part.toUpperCase();
      if (/^gpt$/i.test(part)) return "GPT";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

async function answerWithGemini({
  data,
  question,
  context,
  chunks,
  history,
  scope,
  selectedPage,
  images = [],
  webSearch,
  model,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw httpError(503, "Chat is not configured yet. Set GEMINI_API_KEY in local env or on the Vercel project.");
  }

  let lastCapacityError = null;
  const modelsToTry = geminiModelFallbackOrder(model);

  for (let index = 0; index < modelsToTry.length; index += 1) {
    const candidateModel = modelsToTry[index];
    try {
      const agentResult = await runReadOnlyWikiAgent({
        apiKey,
        model: candidateModel,
        data,
        question,
        initialContext: context,
        initialChunks: chunks,
        history,
        scope,
        selectedPage,
        images,
        webSearch,
      });

      return {
        answer: agentResult.answer,
        references: agentResult.webReferences,
        localReferences: agentResult.localReferences,
        model: candidateModel,
        webSearch,
      };
    } catch (error) {
      if (lastCapacityError && isGeminiModelNotFoundError(error)) {
        console.warn(
          `Gemini fallback model ${candidateModel} is unavailable after a capacity error on an earlier model.`,
        );
        if (index < modelsToTry.length - 1) continue;
        throw httpError(
          503,
          "Gemini is temporarily busy, and the configured fallback model is unavailable. Please try again shortly.",
        );
      }

      if (!isGeminiCapacityError(error) || index === modelsToTry.length - 1) {
        if (isGeminiCapacityError(error) && lastCapacityError) {
          throw httpError(503, "Gemini is temporarily busy across the available chat models. Please try again shortly.");
        }
        throw error;
      }

      lastCapacityError = error;
      console.warn(
        `Gemini model ${candidateModel} is temporarily busy; retrying with ${modelsToTry[index + 1]}.`,
      );
    }
  }

  throw lastCapacityError || httpError(502, "Gemini request failed.");
}

async function runReadOnlyWikiAgent({
  apiKey,
  model,
  data,
  question,
  initialContext,
  initialChunks,
  history,
  scope,
  selectedPage,
  images = [],
  webSearch,
}) {
  const localReferenceMap = new Map();
  const observations = [];

  if (scope === "current" && selectedPage) {
    const observation = executeWikiReadAction(data, {
      action: "read_page",
      pageKey: selectedPage.key,
    }, localReferenceMap);
    observations.push(observation);
  }

  const seenActions = new Set(observations.map((observation) => observation.actionKey).filter(Boolean));
  let finishedReading = false;

  for (let step = 0; step < AGENT_MAX_READ_STEPS && !finishedReading; step += 1) {
    const planText = await callGeminiText({
      apiKey,
      model,
      systemPrompt: WIKI_READER_SYSTEM_PROMPT,
      parts: [{ text: buildWikiReaderPrompt({ data, question, history, scope, selectedPage, initialContext, observations }) }],
      maxOutputTokens: AGENT_PLANNER_OUTPUT_TOKENS,
      temperature: 0.1,
      webSearch: false,
    });
    const actions = parseWikiReaderActions(planText);

    if (!actions.length || actions.some((action) => action.action === "finish")) {
      finishedReading = true;
      break;
    }

    let executed = 0;
    for (const action of actions.slice(0, AGENT_MAX_ACTIONS_PER_STEP)) {
      const normalizedAction = normalizeWikiReadAction(action);
      if (!normalizedAction || normalizedAction.action === "finish") {
        finishedReading = true;
        continue;
      }
      const actionKey = wikiReadActionKey(normalizedAction);
      if (seenActions.has(actionKey)) continue;
      seenActions.add(actionKey);
      observations.push(executeWikiReadAction(data, normalizedAction, localReferenceMap));
      executed += 1;
    }

    if (executed === 0) finishedReading = true;
  }

  const localReferences = renumberLocalReferences([...localReferenceMap.values()]);
  const referenceNumbers = new Map(
    localReferences.map((reference) => [localReferenceKey(reference), reference.citationNumber]),
  );
  const finalContext = buildWikiAgentFinalContext({
    scope,
    selectedPage,
    initialContext,
    observations,
    referenceNumbers,
  });

  const finalPayload = await callGeminiPayload({
    apiKey,
    model,
    systemPrompt: CHAT_SYSTEM_PROMPT,
    parts: buildGeminiParts({
      question,
      context: finalContext,
      history,
      scope,
      selectedPage,
      images,
      webSearch,
    }),
    maxOutputTokens: AGENT_FINAL_OUTPUT_TOKENS,
    temperature: 0.2,
    webSearch,
  });
  const webReferences = extractGeminiWebReferences(finalPayload);
  const answer = annotateWebCitations(extractGeminiText(finalPayload), finalPayload, webReferences);

  return {
    answer: answer.trim() || "Gemini returned no text for this question.",
    webReferences,
    localReferences,
  };
}

const WIKI_READER_SYSTEM_PROMPT = [
  "You are the planning step for a read-only published wiki reader.",
  "Choose which wiki pages or sections the server should read before answering.",
  "You cannot edit files, browse arbitrary URLs, or use tools outside this published snapshot.",
  "Return only JSON. Do not answer the user in this step.",
].join(" ");

async function callGeminiText(args) {
  return extractGeminiText(await callGeminiPayload(args));
}

async function callGeminiPayload({
  apiKey,
  model,
  systemPrompt,
  parts,
  maxOutputTokens,
  temperature,
  webSearch,
}) {
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        generationConfig: {
          maxOutputTokens,
          temperature,
        },
        ...(webSearch ? { tools: [{ google_search: {} }] } : {}),
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = httpError(geminiHttpStatus(response.status), payload.error?.message || "Gemini request failed.");
    error.geminiStatusCode = response.status;
    error.geminiStatus = payload.error?.status || "";
    error.geminiModel = model;
    throw error;
  }

  return payload;
}

function geminiModelFallbackOrder(model) {
  const primary = cleanEnv(model);
  const fallbackOptions = isLiteGeminiModel(primary)
    ? chatModelOptions().filter(isLiteGeminiModel)
    : chatModelOptions();
  const models = [primary, ...fallbackOptions].filter(isGeminiModel);
  return [...new Set(models)];
}

function isLiteGeminiModel(model) {
  return isGeminiModel(model) && /-lite(?:-|$)/i.test(cleanEnv(model).replace(/^models\//, ""));
}

function geminiHttpStatus(statusCode) {
  return statusCode === 429 || statusCode >= 500 ? 503 : 502;
}

function isGeminiCapacityError(error) {
  const statusCode = Number(error?.geminiStatusCode || error?.statusCode);
  const status = cleanEnv(error?.geminiStatus);
  const message = cleanEnv(error?.message);
  return (
    statusCode === 429 ||
    statusCode === 503 ||
    status === "RESOURCE_EXHAUSTED" ||
    status === "UNAVAILABLE" ||
    /high demand|overload|temporarily|try again later|resource exhausted|unavailable/i.test(message)
  );
}

function isGeminiModelNotFoundError(error) {
  const statusCode = Number(error?.geminiStatusCode || error?.statusCode);
  const status = cleanEnv(error?.geminiStatus);
  const message = cleanEnv(error?.message);
  return statusCode === 404 || status === "NOT_FOUND" || /model .*not found|is not found/i.test(message);
}

function buildGeminiParts({
  question,
  context,
  history,
  scope,
  selectedPage,
  images,
  webSearch,
}) {
  const parts = [
    {
      text: buildUserPrompt({
        question,
        context,
        history,
        scope,
        selectedPage,
        images,
        webSearch,
      }),
    },
  ];

  images.forEach((image, index) => {
    parts.push({ text: currentPageImageLabel(image, index) });
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64,
      },
    });
  });

  return parts;
}

function buildUserPrompt({ question, context, history, scope, selectedPage, images = [], webSearch }) {
  const scopeLabel = scope === "current" ? "This page" : "Whole wiki";
  const modeLines = [
    `- Scope: ${scopeLabel}.`,
    ...(scope === "current" && selectedPage
      ? [`- Current reader page: ${selectedPage.title} (${selectedPage.path})`]
      : []),
    ...(scope === "current" && images.length
      ? [`- Current-page image attachments: ${images.length}. They are labeled after this prompt.`]
      : []),
    ...(scope === "wiki"
      ? ["- Global context: schema.md and index.md are included before retrieved wiki passages."]
      : []),
  ];
  return `Ask Wiki mode:
${modeLines.join("\n")}
- Source priority: local published wiki context first.
- Web search: ${webSearch ? "Enabled only for missing current/external context." : "Disabled; do not use or invent external facts."}
- Boundary: answer questions about this published wiki. Do not claim to create, edit, build, or update files.

Recent conversation:
${renderChatHistory(history)}

Public wiki context:
${context}

User question:
${question}

Answer now.`;
}

function buildWikiReaderPrompt({
  data,
  question,
  history,
  scope,
  selectedPage,
  initialContext,
  observations,
}) {
  const scopeLabel = scope === "current" ? "Current page" : "Whole wiki";
  const currentPageLine = selectedPage
    ? `Current reader page: ${selectedPage.key} - ${selectedPage.title} (${selectedPage.path})`
    : "Current reader page: none";

  return `Choose read-only wiki actions before answering.

Question:
${question}

Scope:
- ${scopeLabel}
- ${currentPageLine}

Available actions:
- {"action":"search_pages","query":"...","limit":5}
- {"action":"read_page","pageKey":"page-key"}
- {"action":"search_sections","query":"...","limit":6}
- {"action":"list_links","pageKey":"page-key"}
- {"action":"finish"}

Rules:
- Return only JSON in this exact shape: {"actions":[...]}.
- Use search_pages when the user refers to another concept, page, or topic that is not clearly the current page.
- Use read_page for pages that look directly relevant before final answering.
- Current page scope means the current page is important, not that other pages are forbidden.
- Prefer 1-3 actions. Stop with finish when the read context is enough.

Recent conversation:
${renderChatHistory(history)}

Page catalog:
${renderPageCatalog(data)}

Initial context already available:
${clipText(initialContext, 14000)}

Read observations so far:
${renderWikiReaderObservations(observations, new Map(), { forPlanner: true })}`;
}

function parseWikiReaderActions(text) {
  const parsed = parseJsonObjectFromText(text);
  const rawActions = Array.isArray(parsed?.actions)
    ? parsed.actions
    : Array.isArray(parsed)
      ? parsed
      : parsed?.action
        ? [parsed]
        : [];
  return rawActions.map(normalizeWikiReadAction).filter(Boolean);
}

function parseJsonObjectFromText(text) {
  const raw = String(text || "").trim();
  const candidates = [
    raw,
    raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
  ];
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) candidates.push(arrayMatch[0]);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function normalizeWikiReadAction(action) {
  if (!action || typeof action !== "object") return null;
  const name = String(action.action || action.tool || action.name || "").trim().toLowerCase();
  if (name === "finish" || name === "done") return { action: "finish" };

  if (name === "search_pages" || name === "search") {
    const query = cleanActionText(action.query || action.q || action.text);
    if (!query) return null;
    return { action: "search_pages", query, limit: clampLimit(action.limit, 8) };
  }

  if (name === "read_page" || name === "open_page") {
    const pageKey = cleanPageKey(action.pageKey || action.key || action.page || action.path);
    if (!pageKey) return null;
    return { action: "read_page", pageKey };
  }

  if (name === "search_sections" || name === "search_chunks") {
    const query = cleanActionText(action.query || action.q || action.text);
    if (!query) return null;
    return { action: "search_sections", query, limit: clampLimit(action.limit, 8) };
  }

  if (name === "list_links" || name === "links") {
    const pageKey = cleanPageKey(action.pageKey || action.key || action.page || action.path);
    if (!pageKey) return null;
    return { action: "list_links", pageKey };
  }

  return null;
}

function executeWikiReadAction(data, action, localReferenceMap) {
  if (action.action === "search_pages") {
    return {
      action: action.action,
      actionKey: wikiReadActionKey(action),
      query: action.query,
      results: searchPages(data, action.query, action.limit),
    };
  }

  if (action.action === "search_sections") {
    const results = rankChunks(data.chunks || [], action.query, "")
      .slice(0, action.limit)
      .map((chunk) => {
        const reference = addLocalReference(localReferenceMap, referenceFromChunk(chunk));
        return {
          refKey: localReferenceKey(reference),
          pageKey: chunk.pageKey,
          title: chunk.pageTitle,
          heading: chunk.headingPath?.join(" > ") || chunk.pageTitle,
          path: chunk.path,
          text: clipText(chunk.text, AGENT_SECTION_READ_CHAR_LIMIT),
        };
      });
    return {
      action: action.action,
      actionKey: wikiReadActionKey(action),
      query: action.query,
      results,
    };
  }

  if (action.action === "read_page") {
    const page = findPage(data, action.pageKey) || findPageByPathOrTitle(data, action.pageKey);
    if (!page) {
      return {
        action: action.action,
        actionKey: wikiReadActionKey(action),
        pageKey: action.pageKey,
        error: "Page not found.",
      };
    }
    const reference = addLocalReference(localReferenceMap, referenceFromPage(page));
    return {
      action: action.action,
      actionKey: wikiReadActionKey({ ...action, pageKey: page.key }),
      pageKey: page.key,
      title: page.title,
      path: page.path,
      refKey: localReferenceKey(reference),
      text: clipText(page.text || "", AGENT_PAGE_READ_CHAR_LIMIT),
    };
  }

  if (action.action === "list_links") {
    const page = findPage(data, action.pageKey) || findPageByPathOrTitle(data, action.pageKey);
    return {
      action: action.action,
      actionKey: wikiReadActionKey(action),
      pageKey: action.pageKey,
      title: page?.title || "",
      links: page ? extractPageLinks(data, page).slice(0, 16) : [],
      error: page ? "" : "Page not found.",
    };
  }

  return {
    action: "unknown",
    actionKey: wikiReadActionKey(action),
    error: "Unsupported action.",
  };
}

function buildWikiAgentFinalContext({
  scope,
  selectedPage,
  initialContext,
  observations,
  referenceNumbers,
}) {
  const parts = [
    `Scope: ${scope === "current" ? "Current page" : "Whole wiki"}`,
    selectedPage ? `Current reader page: ${selectedPage.title} (${selectedPage.path})` : "",
    "Initial wiki context:",
    stripContextCitationNumbers(clipText(initialContext, 14000)),
    "Read-only wiki observations:",
    renderWikiReaderObservations(observations, referenceNumbers, { forPlanner: false }),
  ].filter(Boolean);
  return clipText(parts.join("\n\n"), AGENT_OBSERVATION_CHAR_LIMIT);
}

function renderWikiReaderObservations(observations, referenceNumbers, { forPlanner = false } = {}) {
  if (!observations.length) return "No pages or sections have been read yet.";

  return observations
    .map((observation, index) => {
      if (observation.action === "search_pages") {
        const results = observation.results?.length
          ? observation.results
              .map(
                (result) =>
                  `- ${result.key}: ${result.title} (${result.path})\n  ${result.excerpt}`,
              )
              .join("\n")
          : "- No page matches.";
        return `Observation ${index + 1}: search_pages("${observation.query}")\n${results}`;
      }

      if (observation.action === "search_sections") {
        const results = observation.results?.length
          ? observation.results
              .map((result) => {
                const number = referenceNumbers.get(result.refKey);
                const prefix = number ? `[${number}] ` : "";
                return `${prefix}${result.title} (${result.path})\nHeading: ${result.heading}\n${result.text}`;
              })
              .join("\n\n")
          : "No section matches.";
        return `Observation ${index + 1}: search_sections("${observation.query}")\n${results}`;
      }

      if (observation.action === "read_page") {
        if (observation.error) {
          return `Observation ${index + 1}: read_page("${observation.pageKey}")\n${observation.error}`;
        }
        const number = referenceNumbers.get(observation.refKey);
        const prefix = number ? `[${number}] ` : "";
        const text = forPlanner
          ? clipText(observation.text, 4000)
          : observation.text;
        return `Observation ${index + 1}: read_page("${observation.pageKey}")\n${prefix}${observation.title} (${observation.path})\n${text}`;
      }

      if (observation.action === "list_links") {
        const links = observation.links?.length
          ? observation.links.map((link) => `- ${link.key}: ${link.title} (${link.path})`).join("\n")
          : observation.error || "No recognized links.";
        return `Observation ${index + 1}: list_links("${observation.pageKey}")\n${links}`;
      }

      return `Observation ${index + 1}: ${observation.error || "Unknown observation."}`;
    })
    .join("\n\n---\n\n");
}

function stripContextCitationNumbers(text) {
  return String(text || "")
    .replace(/^\[(\d+)]\s+/gm, "")
    .replace(/Retrieved context:\n\[(\d+)]/g, "Retrieved context:\n");
}

function searchPages(data, query, limit = 8) {
  const tokens = tokenize(query);
  const chunkScores = new Map();
  for (const chunk of rankChunks(data.chunks || [], query, "").slice(0, 40)) {
    chunkScores.set(chunk.pageKey, (chunkScores.get(chunk.pageKey) || 0) + chunk.score);
  }

  return (data.pages || [])
    .map((page, index) => {
      const haystack = `${page.title} ${page.path} ${page.excerpt || ""} ${page.text || ""}`;
      const hayTokens = tokenize(haystack);
      let score = chunkScores.get(page.key) || 0;
      for (const token of tokens) {
        if (hayTokens.includes(token)) score += token.length > 4 ? 4 : 2;
        if (String(page.key || "").toLowerCase().includes(token)) score += 5;
        if (String(page.title || "").toLowerCase().includes(token)) score += 6;
      }
      if (haystack.toLowerCase().includes(String(query || "").toLowerCase())) score += 10;
      return {
        key: page.key,
        title: page.title,
        path: page.path,
        excerpt: page.excerpt || firstMeaningfulLine(page.text),
        score,
        index,
      };
    })
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, clampLimit(limit, 8));
}

function renderPageCatalog(data) {
  return (data.pages || [])
    .map((page) => `- ${page.key}: ${page.title} (${page.path})`)
    .join("\n")
    .slice(0, 16000);
}

function extractPageLinks(data, page) {
  const pagesByKey = new Map((data.pages || []).map((item) => [item.key, item]));
  const links = new Map();
  String(page.text || "").replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, (_match, rawKey) => {
    const key = slugifyPageReference(rawKey);
    const linkedPage = pagesByKey.get(key);
    if (linkedPage) links.set(linkedPage.key, linkedPage);
  });
  String(page.text || "").replace(/\]\((\/[^)#]+)(?:#[^)]+)?\)/g, (_match, rawPath) => {
    const linkedPage = (data.pages || []).find((item) => item.path === rawPath);
    if (linkedPage) links.set(linkedPage.key, linkedPage);
  });
  return [...links.values()].map((item) => ({
    key: item.key,
    title: item.title,
    path: item.path,
  }));
}

function findPageByPathOrTitle(data, value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return (
    (data.pages || []).find((page) => String(page.path || "").toLowerCase() === normalized) ||
    (data.pages || []).find((page) => String(page.title || "").toLowerCase() === normalized) ||
    null
  );
}

function addLocalReference(referenceMap, reference) {
  const key = localReferenceKey(reference);
  if (!referenceMap.has(key)) {
    referenceMap.set(key, { ...reference });
  }
  return referenceMap.get(key);
}

function referenceFromChunk(chunk) {
  const headingPath = Array.isArray(chunk.headingPath) ? chunk.headingPath.filter(Boolean) : [];
  const sectionTitle =
    [...headingPath].reverse().find((heading) => heading !== chunk.pageTitle) || chunk.pageTitle;
  return {
    pageKey: chunk.pageKey,
    title: chunk.pageTitle,
    heading: sectionTitle,
    path: chunk.path,
  };
}

function referenceFromPage(page) {
  return {
    pageKey: page.key,
    title: page.title,
    heading: page.title,
    path: page.path,
  };
}

function renumberLocalReferences(references) {
  return references.map((reference, index) => ({
    ...reference,
    citationNumber: index + 1,
  }));
}

function localReferenceKey(reference) {
  return [
    reference?.pageKey || "",
    reference?.path || "",
    reference?.heading || "",
  ].join("::");
}

function wikiReadActionKey(action) {
  if (!action) return "";
  return [
    action.action || "",
    action.pageKey || "",
    action.query || "",
    action.limit || "",
  ].join("::").toLowerCase();
}

function cleanActionText(value) {
  return String(value || "").trim().slice(0, 200);
}

function cleanPageKey(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^robot-hardware\/?/, "")
    .replace(/^#/, "")
    .slice(0, 160);
}

function clampLimit(value, fallback) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(limit), 12));
}

function firstMeaningfulLine(text) {
  return (
    String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#")) || ""
  ).slice(0, 240);
}

function slugifyPageReference(value) {
  return String(value || "")
    .trim()
    .split("/")
    .pop()
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clipText(text, maxChars) {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[truncated after ${maxChars} characters]`;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function loadChatData() {
  if (cachedData) return cachedData;
  const filePath = path.join(process.cwd(), "api", "data", "chat-data.json");
  cachedData = JSON.parse(await fs.readFile(filePath, "utf8"));
  return cachedData;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildChatContext(data, { question, pageKey, scope }) {
  const selectedPage = scope === "current" ? findPage(data, pageKey) : null;
  const pageChunks = data.chunks.filter((chunk) => chunk.pageKey === pageKey);
  const globalDocs = scope === "wiki" ? wholeWikiGlobalDocs(data) : [];
  const candidateChunks = scope === "current"
    ? pageChunks
    : data.chunks.filter((chunk) => chunk.pageKey !== "index");
  const currentPageBoostKey = scope === "current" ? pageKey : "";
  const rankedChunks = rankChunks(candidateChunks, question, currentPageBoostKey);
  let chunks = expandRankedChunks(
    scope === "current" ? pageChunks : data.chunks,
    rankedChunks.slice(0, CHAT_CONTEXT_HIT_LIMIT),
    CHAT_CONTEXT_CHUNK_LIMIT,
  );

  if (!chunks.length && scope === "current") {
    chunks = pageChunks.slice().sort((a, b) => a.sortOrder - b.sortOrder).slice(0, CHAT_CONTEXT_CHUNK_LIMIT);
  }

  const scopeLabel = scope === "current" ? "This page" : "Whole wiki";
  const pageLine = scope === "current" && selectedPage
    ? `${selectedPage.title} (${selectedPage.path})`
    : "";
  const globalContext = renderGlobalDocs(globalDocs);
  const renderedChunks = chunks.length
    ? chunks
        .map(
          (chunk, index) =>
            `[${index + 1}] ${chunk.pageTitle} (${chunk.path})\nHeading: ${chunk.headingPath?.join(" > ") || chunk.pageTitle}\n${chunk.text}`,
        )
        .join("\n\n---\n\n")
    : "No matching public wiki context was found.";

  return {
    chunks,
    selectedPage,
    hasContext: chunks.length > 0 || globalDocs.length > 0,
    context: [
      `Scope: ${scopeLabel}`,
      pageLine ? `Current reader page: ${pageLine}` : "",
      globalContext,
      `Retrieved context:\n${renderedChunks}`.slice(0, CHAT_CONTEXT_CHAR_LIMIT),
    ]
      .filter(Boolean)
      .join("\n\n"),
    summary: {
      scope,
      pageKey: scope === "current" ? pageKey : "",
      pageTitle: scope === "current" ? selectedPage?.title || "" : "",
      chunkCount: chunks.length,
      references: contextReferences(chunks),
    },
  };
}

async function loadCurrentPageImages(page, question, req) {
  const pageImages = Array.isArray(page?.images) ? page.images : [];
  const selected = [];
  let totalBytes = 0;

  for (const image of rankPageImages(pageImages, question)) {
    if (selected.length >= CURRENT_PAGE_IMAGE_LIMIT) break;
    if (!isSupportedChatImage(image)) continue;

    const remainingBytes = CURRENT_PAGE_IMAGE_TOTAL_MAX_BYTES - totalBytes;
    const imageData = await readCurrentPageImage(image, req, remainingBytes);
    if (!imageData) continue;

    selected.push({
      key: String(image.key || ""),
      src: String(image.src || ""),
      assetPath: String(image.assetPath || ""),
      filename: String(image.filename || path.basename(image.assetPath || image.src || "image")),
      alt: String(image.alt || ""),
      heading: String(image.heading || ""),
      mimeType: imageData.mimeType,
      size: imageData.size,
      base64: imageData.base64,
    });
    totalBytes += imageData.size;
  }

  return selected;
}

async function readCurrentPageImage(image, req, remainingBytes) {
  const maxBytes = Math.min(CURRENT_PAGE_IMAGE_MAX_BYTES, remainingBytes);
  if (maxBytes <= 0) return null;

  const fromFile = await readCurrentPageImageFromFile(image, maxBytes);
  if (fromFile) return fromFile;
  return readCurrentPageImageFromOrigin(image, req, maxBytes);
}

async function readCurrentPageImageFromFile(image, maxBytes) {
  const filePath = publicFilePathForPublishedAsset(image.src);
  if (!filePath) return null;

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return null;
  }

  if (!stat.isFile() || stat.size > maxBytes) return null;

  try {
    return {
      mimeType: image.mimeType,
      size: stat.size,
      base64: await fs.readFile(filePath, "base64"),
    };
  } catch {
    return null;
  }
}

async function readCurrentPageImageFromOrigin(image, req, maxBytes) {
  const origin = requestOrigin(req);
  if (!origin) return null;

  let response;
  try {
    response = await fetch(`${origin}${image.src}`);
  } catch {
    return null;
  }

  if (!response.ok) return null;
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || image.mimeType;
  if (!CHAT_IMAGE_MIME_TYPES.has(contentType)) return null;

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) return null;
  return {
    mimeType: contentType,
    size: buffer.byteLength,
    base64: buffer.toString("base64"),
  };
}

function rankPageImages(images, question) {
  const tokens = tokenize(question);
  return images
    .map((image, index) => {
      const item = image || {};
      const haystack = [
        item.alt,
        item.heading,
        item.filename,
        item.assetPath,
      ]
        .filter(Boolean)
        .join(" ");
      const hayTokens = tokenize(haystack);
      let score = 0;
      for (const token of tokens) {
        if (hayTokens.includes(token)) score += token.length > 4 ? 3 : 1;
      }
      if (haystack.toLowerCase().includes(String(question || "").toLowerCase())) score += 6;
      return { ...item, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function isSupportedChatImage(image) {
  return (
    image &&
    CHAT_IMAGE_MIME_TYPES.has(image.mimeType) &&
    typeof image.src === "string" &&
    image.src.startsWith("/published-assets/")
  );
}

function publicFilePathForPublishedAsset(src) {
  const cleanSrc = String(src || "").split(/[?#]/)[0];
  if (!cleanSrc.startsWith("/published-assets/")) return "";

  let decoded;
  try {
    decoded = decodeURIPath(cleanSrc.replace(/^\/+/, ""));
  } catch {
    return "";
  }

  const normalized = path.normalize(decoded);
  const publicRoot = path.join(process.cwd(), "public");
  const fullPath = path.join(publicRoot, normalized);
  const relative = path.relative(publicRoot, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
  if (!normalizePath(relative).startsWith("published-assets/")) return "";
  return fullPath;
}

function requestOrigin(req) {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "")
    .split(",")[0]
    .trim();
  if (!host || /[\s/\\]/.test(host)) return "";

  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol = forwardedProto === "http" ? "http" : "https";
  return `${protocol}://${host}`;
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function decodeURIPath(value) {
  return String(value || "").split("/").map(decodeURIComponent).join("/");
}

function currentPageImageLabel(image, index) {
  const title = image.alt || image.heading || image.filename || `image ${index + 1}`;
  return [
    `Current page image ${index + 1}: ${title}`,
    image.heading ? `Heading: ${image.heading}` : "",
    image.src ? `Path: ${image.src}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function wholeWikiGlobalDocs(data) {
  const docs = Array.isArray(data.globalDocs) ? data.globalDocs : [];
  const schemaDoc = docs.find((doc) => doc.key === "schema" || doc.path === "schema.md");
  const indexDoc =
    docs.find((doc) => doc.key === "index" || doc.path === "index.md") ||
    pageAsGlobalDoc(findPage(data, "index"), "index.md");
  return [schemaDoc, indexDoc]
    .filter(Boolean)
    .filter((doc) => typeof doc.text === "string" && doc.text.trim());
}

function pageAsGlobalDoc(page, fallbackPath) {
  if (!page) return null;
  return {
    key: page.key,
    title: page.title,
    path: fallbackPath,
    text: page.text,
  };
}

function expandRankedChunks(allChunks, rankedChunks, limit) {
  const chunkByPosition = new Map(
    allChunks.map((chunk) => [chunkPositionKey(chunk.pageKey, chunk.sortOrder), chunk]),
  );
  const selected = new Map();

  for (const hit of rankedChunks) {
    const pageNeighbors = [];
    for (let offset = -CHAT_CONTEXT_NEIGHBOR_RADIUS; offset <= CHAT_CONTEXT_NEIGHBOR_RADIUS; offset += 1) {
      const neighbor = chunkByPosition.get(chunkPositionKey(hit.pageKey, hit.sortOrder + offset));
      if (neighbor) pageNeighbors.push(neighbor);
    }

    pageNeighbors
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((chunk) => {
        if (selected.size < limit) selected.set(chunk.key, chunk);
      });

    if (selected.size >= limit) break;
  }

  return [...selected.values()];
}

function chunkPositionKey(pageKey, sortOrder) {
  return `${pageKey}::${sortOrder}`;
}

function renderGlobalDocs(docs) {
  if (!docs.length) return "";
  const text = docs
    .map((doc) => {
      const title = doc.title || doc.path || "Workspace document";
      const docPath = doc.path || doc.key || "workspace document";
      return `Global document: ${docPath} - ${title}\n${doc.text.trim()}`;
    })
    .join("\n\n---\n\n");
  return `Global wiki context:\n${text}`.slice(0, WHOLE_WIKI_GLOBAL_DOC_CHAR_LIMIT);
}

function findPage(data, pageKey) {
  return data.pages.find((page) => page.key === pageKey) || null;
}

function parseChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.text === "string" &&
        message.text.trim(),
    )
    .slice(-CHAT_HISTORY_LIMIT)
    .map((message) => ({
      role: message.role,
      contextLabel: typeof message.contextLabel === "string" ? message.contextLabel.slice(0, 120) : "",
      webSearchEnabled: Boolean(message.webSearchEnabled),
      text:
        message.text.length > CHAT_HISTORY_TEXT_LIMIT
          ? `${message.text.slice(0, CHAT_HISTORY_TEXT_LIMIT)}\n\n[truncated]`
          : message.text,
    }));
}

function renderChatHistory(history) {
  if (!history.length) return "No previous conversation.";
  return history
    .map((message) => {
      const label = message.role === "user" ? "User" : "Assistant";
      const context = message.contextLabel ? ` [context: ${message.contextLabel}]` : "";
      const webSearch = message.webSearchEnabled ? " [used web search]" : "";
      return `${label}${context}${webSearch}: ${message.text}`;
    })
    .join("\n\n");
}

function allowRequest(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = Number(process.env.CHAT_RATE_LIMIT_PER_HOUR || 25);
  const bucket = rateLimit.get(ip) || [];
  const recent = bucket.filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  rateLimit.set(ip, recent);
  return true;
}

function rankChunks(chunks, question, currentPageKey) {
  const tokens = tokenize(question);
  return chunks
    .map((chunk) => {
      const haystack = `${chunk.pageTitle} ${chunk.headingPath?.join(" ")} ${chunk.text}`;
      const hayTokens = tokenize(haystack);
      let score = chunk.pageKey === currentPageKey ? 4 : 0;
      for (const token of tokens) {
        if (hayTokens.includes(token)) score += token.length > 4 ? 3 : 1;
      }
      if (haystack.toLowerCase().includes(question.toLowerCase())) score += 6;
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder);
}

function tokenize(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .slice(0, 40);
}

function extractGeminiText(payload) {
  return (payload.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n");
}

function extractGeminiWebReferences(payload) {
  const seen = new Set();
  const refs = [];
  for (const candidate of payload.candidates || []) {
    for (const chunk of candidate.groundingMetadata?.groundingChunks || []) {
      const uri = chunk.web?.uri;
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      refs.push({
        kind: "web",
        citationNumber: refs.length + 1,
        title: chunk.web?.title || hostnameForUrl(uri),
        path: uri,
      });
      if (refs.length >= 5) return refs;
    }
  }
  return refs;
}

function annotateWebCitations(text, payload, webReferences) {
  const answer = String(text || "");
  if (!answer || !webReferences.length) return answer;

  const candidate = payload.candidates?.[0];
  const metadata = candidate?.groundingMetadata;
  const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];
  const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  if (!supports.length || !chunks.length) return answer;

  const uriToCitationNumber = new Map(webReferences.map((reference) => [reference.path, reference.citationNumber]));
  const insertions = [];
  const seenInsertionKeys = new Set();

  for (const support of supports) {
    const numbers = [...new Set((support.groundingChunkIndices || [])
      .map((index) => uriToCitationNumber.get(chunks[index]?.web?.uri))
      .filter((number) => Number.isInteger(number) && number > 0))]
      .sort((a, b) => a - b);
    if (!numbers.length) continue;

    const marker = `[${numbers.join(", ")}]`;
    const endIndex = findGroundingSegmentEnd(answer, support.segment);
    if (!Number.isInteger(endIndex) || endIndex < 0) continue;
    if (hasCitationMarkerNear(answer, endIndex)) continue;

    const key = `${endIndex}:${marker}`;
    if (seenInsertionKeys.has(key)) continue;
    seenInsertionKeys.add(key);
    insertions.push({ index: endIndex, marker });
  }

  if (!insertions.length) return answer;
  let annotated = answer;
  for (const insertion of insertions.sort((a, b) => b.index - a.index)) {
    annotated = `${annotated.slice(0, insertion.index)} ${insertion.marker}${annotated.slice(insertion.index)}`;
  }
  return annotated;
}

function hasCitationMarkerNear(text, index) {
  const markerPattern = /\[\d+(?:\s*,\s*\d+)*\]/;
  const after = text.slice(index, index + 18);
  const before = text.slice(Math.max(0, index - 18), index);
  return /^\s*\[\d+(?:\s*,\s*\d+)*\]/.test(after) || markerPattern.test(before);
}

function findGroundingSegmentEnd(text, segment) {
  const segmentText = String(segment?.text || "").trim();
  if (segmentText) {
    const index = text.indexOf(segmentText);
    if (index !== -1) return index + segmentText.length;
  }

  const endIndex = Number(segment?.endIndex);
  if (Number.isInteger(endIndex) && endIndex >= 0 && endIndex <= text.length) return endIndex;
  return -1;
}

function renumberLocalReferencesAfter(references, offset = 0) {
  const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
  if (!start) return references;
  return references.map((reference, index) => ({
    ...reference,
    citationNumber: start + index + 1,
  }));
}

function hostnameForUrl(uri) {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return uri;
  }
}

function contextReferences(chunks) {
  return chunks.map((chunk, index) => {
    const headingPath = Array.isArray(chunk.headingPath) ? chunk.headingPath.filter(Boolean) : [];
    const sectionTitle =
      [...headingPath].reverse().find((heading) => heading !== chunk.pageTitle) || chunk.pageTitle;
    return {
      citationNumber: index + 1,
      pageKey: chunk.pageKey,
      title: chunk.pageTitle,
      heading: sectionTitle,
      path: chunk.path,
    };
  });
}
