function clean(value) {
  return String(value || "").trim();
}

function normalizeProblemCode(value) {
  const match = clean(value).match(/(?:p|pattern)\s*0*(\d+)/i);
  return match ? `P${Number(match[1])}` : clean(value).toUpperCase();
}

function normalizeQuestionId(value) {
  const match = clean(value).match(/(?:q|question)\s*0*(\d+)/i);
  return match ? `Q${Number(match[1])}` : clean(value).toUpperCase();
}

export function pageChatContext({ pageKey, pageTitle = "" }) {
  const normalizedPageKey = clean(pageKey) || "index";
  return {
    key: `page:${normalizedPageKey}`,
    kind: "page",
    pageKey: normalizedPageKey,
    label: clean(pageTitle) || (normalizedPageKey === "index" ? "Wiki Index" : normalizedPageKey),
    problemCode: "",
    questionId: "",
  };
}

export function problemChatContext({ pageKey, pageTitle = "", problemCode, questionId }) {
  const pageContext = pageChatContext({ pageKey, pageTitle });
  const normalizedProblemCode = normalizeProblemCode(problemCode);
  const normalizedQuestionId = normalizeQuestionId(questionId);
  return {
    key: `problem:${pageContext.pageKey}:${normalizedProblemCode.toLowerCase()}:${normalizedQuestionId.toLowerCase()}`,
    kind: "problem",
    pageKey: pageContext.pageKey,
    label: `${pageContext.label} · ${normalizedProblemCode} ${normalizedQuestionId}`,
    problemCode: normalizedProblemCode,
    questionId: normalizedQuestionId,
  };
}

export function inferProblemIdentity(text) {
  const value = clean(text);
  const patternThenQuestion = value.match(
    /\b(?:p|pattern)\s*0*(\d+)\s*(?:q|question)\s*0*(\d+)\b/i,
  );
  if (patternThenQuestion) {
    return {
      problemCode: `P${Number(patternThenQuestion[1])}`,
      questionId: `Q${Number(patternThenQuestion[2])}`,
    };
  }

  const questionThenPattern = value.match(
    /\b(?:q|question)\s*0*(\d+)\s*(?:p|pattern)\s*0*(\d+)\b/i,
  );
  if (!questionThenPattern) return null;
  return {
    problemCode: `P${Number(questionThenPattern[2])}`,
    questionId: `Q${Number(questionThenPattern[1])}`,
  };
}

export function chatContextFromThread(
  thread,
  { fallbackPageKey = "index", pageTitleForKey = () => "" } = {},
) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const messagePageKey = [...messages]
    .reverse()
    .find((message) => clean(message?.contextPageKey))?.contextPageKey;
  const pageKey =
    clean(thread?.contextPageKey) ||
    clean(thread?.initialContextPageKey) ||
    clean(messagePageKey) ||
    clean(fallbackPageKey) ||
    "index";
  const pageTitle = clean(pageTitleForKey(pageKey)) || clean(thread?.contextPageTitle);
  const firstUserText = messages.find((message) => message?.role === "user")?.text || "";
  const inferredProblem = inferProblemIdentity(firstUserText);
  const problemCode = normalizeProblemCode(thread?.problemCode || inferredProblem?.problemCode);
  const questionId = normalizeQuestionId(thread?.questionId || inferredProblem?.questionId);
  const hasProblemContext =
    thread?.contextKind === "problem" ||
    clean(thread?.contextKey).startsWith("problem:") ||
    Boolean(problemCode && questionId);

  if (hasProblemContext && problemCode && questionId) {
    return problemChatContext({ pageKey, pageTitle, problemCode, questionId });
  }
  return pageChatContext({ pageKey, pageTitle });
}

export function threadMatchesContext(thread, contextKey) {
  return clean(thread?.contextKey) === clean(contextKey);
}

export function selectThreadForContext(threads, activeThreadIdsByContext, contextKey) {
  const items = Array.isArray(threads) ? threads : [];
  const mappedId = clean(activeThreadIdsByContext?.[contextKey]);
  const mapped = mappedId
    ? items.find((thread) => thread?.id === mappedId && threadMatchesContext(thread, contextKey))
    : null;
  if (mapped) return mapped;
  return items.find((thread) => threadMatchesContext(thread, contextKey)) || null;
}
