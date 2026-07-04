import "./styles.css";
import "katex/dist/katex.min.css";
import "katex/contrib/mhchem";
import renderMathInElement from "katex/contrib/auto-render";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { enableMathProtection } from "./markdown-math.js";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const app = document.querySelector("#app");
const LAYOUT_STORAGE_KEY = "maple-public-wiki-layout";
const READER_TABS_STORAGE_KEY = "maple-public-wiki-reader-tabs";
const CHAT_THREADS_STORAGE_PREFIX = "maple-public-wiki-chat-threads";
const ACTIVE_CHAT_THREAD_STORAGE_PREFIX = "maple-public-wiki-active-chat-thread";
const MAX_READER_TABS = 12;
const MAX_CHAT_THREADS = 12;
const CHAT_HISTORY_LIMIT = 6;
const CHAT_HISTORY_TEXT_LIMIT = 1600;
const CHAT_SCROLL_BOTTOM_THRESHOLD = 32;
const READER_GUIDE_KEY = "_guide";
const DEFAULT_LAYOUT = {
  sidebarWidth: 210,
  chatWidth: 356,
  mobileChatHeight: 50,
  sidebarCollapsed: false,
};
const PRIMARY_PAGE_TYPES = new Set(["index", "guides", "concepts", "summaries"]);
const PANEL_LIMITS = {
  sidebar: { min: 190, max: 320 },
  chat: { min: 280, max: 560 },
  mobileChatHeight: { min: 36, max: 88 },
};
const CHAT_THINKING_LABELS = [
  "Checking wiki context",
  "Reading linked pages",
  "Looking through sources",
  "Drafting a grounded answer",
];
const chatMarkdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: true,
}).use(enableMathProtection);
const chatSanitizeOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "span",
    "sup",
    "sub",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ["href", "name", "target", "rel"],
    code: ["class"],
    th: ["align"],
    td: ["align"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};
const state = {
  snapshot: null,
  chatConfig: {
    provider: "",
    model: "",
    modelLabel: "AI",
    webSearchSupported: true,
    models: [],
  },
  activePageKey: "index",
  sidebarTab: "",
  searchQuery: "",
  messages: [],
  chatThreads: [],
  activeChatThreadId: "",
  chatHistoryOpen: false,
  askingThreadIds: new Set(),
  webSearch: false,
  chatScope: "wiki",
  connectionsOpen: false,
  unitTab: "concepts",
  layout: loadLayoutState(),
  readerTabs: loadReaderTabs(),
};
const pdfDocuments = new Map();
const pdfViews = new Map();
const sourceTextCache = new Map();
let connectionGraph = null;
let scrollSaveFrame = null;
let chatScrollSaveFrame = null;
let mermaidInstance = null;

init().catch((error) => {
  app.innerHTML = `<main class="load-error">Failed to load wiki: ${escapeHtml(
    error.message,
  )}</main>`;
});

async function init() {
  const response = await fetch("/data/snapshot.json");
  if (!response.ok) throw new Error("snapshot.json not found");
  state.snapshot = await response.json();
  await loadChatConfig();
  restoreChatThreads();

  if (location.pathname === "/") {
    history.replaceState(null, "", `/${state.snapshot.manifest.slug}`);
  }

  state.activePageKey = pageKeyFromLocation();
  window.addEventListener("popstate", () => {
    state.activePageKey = pageKeyFromLocation();
    render();
    if (!sourceFromLocation()) {
      scrollToReaderPosition(decodeURIComponent(location.hash.replace(/^#/, "")));
    } else if (!sourceFragmentFromLocation()) {
      scrollToReaderPosition();
    }
  });
  window.addEventListener("scroll", scheduleActiveTabScrollSave, { passive: true });
  document.addEventListener("click", handleInternalLinkClick, true);
  document.addEventListener("click", handleDocumentClick);
  render();
}

function render(options = {}) {
  const { preserveSidebarScroll = true, chatForceBottom = false } = options;
  saveChatScrollPosition();
  const sidebarScrollTop = preserveSidebarScroll ? document.querySelector(".sidebar")?.scrollTop || 0 : 0;
  const readerTabsScrollLeft = document.querySelector(".reader-tabs")?.scrollLeft || 0;
  const { snapshot } = state;
  const activeSource = sourceFromLocation();
  const sidebarTab = state.sidebarTab || (activeSource ? "sources" : "pages");
  const page = activeSource ? null : findPage(state.activePageKey) || snapshot.pages[0];
  const activeTab = activeSource ? readerTabForSource(activeSource) : readerTabForPage(page);
  ensureReaderTab(activeTab);
  const shellClass = [
    "shell",
    activeSource ? "source-shell" : "",
    state.layout.sidebarCollapsed ? "is-sidebar-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  document.title = activeSource
    ? `${activeSource.title} - ${snapshot.manifest.title}`
    : `${page.title} - ${snapshot.manifest.title}`;

  app.innerHTML = `
    <div class="${shellClass}" style="${layoutStyle()}">
      <header class="publish-header">
        <div class="publish-header-inner">
          <button class="publish-menu" type="button" data-sidebar-toggle aria-label="Open wiki navigation">
            <span></span><span></span><span></span>
          </button>
          <a class="publish-brand" href="/${snapshot.manifest.slug}" data-route="index">
            <span class="publish-brand-title">${escapeHtml(snapshot.manifest.title)}</span>
            <span class="publish-brand-meta">${snapshot.manifest.pageCount} pages / ${snapshot.manifest.publicSourceCount} sources</span>
          </a>
          ${
            activeSource
              ? ""
              : `
                <button class="publish-chat-toggle" type="button" data-chat-toggle aria-label="Open Ask Wiki">
                  ${renderChatIcon("publish-chat-icon")}
                  <span>Ask</span>
                </button>
              `
          }
        </div>
      </header>

      <div class="publish-layout ${activeSource ? "source-layout" : "has-chat"}">
      <aside class="sidebar">
        <div class="sidebar-head">
          <a class="brand" href="/${snapshot.manifest.slug}" data-route="index">
            <span class="brand-mark">M</span>
            <span>
              <strong>${escapeHtml(snapshot.manifest.title)}</strong>
              <small>${snapshot.manifest.pageCount} pages · ${snapshot.manifest.publicSourceCount} sources</small>
            </span>
          </a>
        </div>
        <label class="search-box">
          <input
            type="search"
            value="${escapeHtml(state.searchQuery)}"
            placeholder="${sidebarTab === "sources" ? "Search sources" : "Search wiki"}"
            data-search
          />
        </label>
        <div class="sidebar-tabs" role="tablist" aria-label="Sidebar sections">
          <button
            class="${sidebarTab === "pages" ? "active" : ""}"
            type="button"
            data-sidebar-tab="pages"
          >
            Wiki
          </button>
          <button
            class="${sidebarTab === "sources" ? "active" : ""}"
            type="button"
            data-sidebar-tab="sources"
          >
            Sources
          </button>
        </div>
        <nav class="page-nav" aria-label="${sidebarTab === "sources" ? "Wiki sources" : "Wiki pages"}">
          ${sidebarTab === "sources" ? renderSourceNav() : renderNav()}
        </nav>
      </aside>
      <div
        class="panel-resizer sidebar-resizer"
        data-panel-resizer="sidebar"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize wiki navigation"
      ></div>

      <main class="reader ${activeSource ? "source-reader" : ""} ${!activeSource && page?.unit ? "unit-reader" : ""}">
        ${renderReaderTabs(activeTab.id)}
        ${activeSource ? renderSourceReader(activeSource) : renderPageReader(page)}
      </main>

      ${
        activeSource
          ? ""
          : `
            <div
              class="panel-resizer chat-resizer"
              data-panel-resizer="chat"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Ask Wiki panel"
            ></div>
            ${renderChatPanel()}
          `
      }
      </div>

      <button class="screen-shade" type="button" data-overlay-close aria-label="Close panels"></button>
    </div>
  `;

  bindEvents();
  postProcessArticleLinks();
  renderMath();
  renderMermaid();
  mountSourceViewer(activeSource);
  if (preserveSidebarScroll) restoreSidebarScroll(sidebarScrollTop);
  restoreReaderTabsScroll(readerTabsScrollLeft);
  keepActiveReaderTabInView();
  restoreChatScrollPosition({ forceBottom: chatForceBottom });
}

function loadLayoutState() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || "{}");
  } catch {
    stored = {};
  }

  return {
    sidebarWidth: clamp(Number(stored.sidebarWidth) || DEFAULT_LAYOUT.sidebarWidth, PANEL_LIMITS.sidebar.min, PANEL_LIMITS.sidebar.max),
    chatWidth: clamp(Number(stored.chatWidth) || DEFAULT_LAYOUT.chatWidth, PANEL_LIMITS.chat.min, PANEL_LIMITS.chat.max),
    mobileChatHeight: clamp(
      Number(stored.mobileChatHeight) || DEFAULT_LAYOUT.mobileChatHeight,
      PANEL_LIMITS.mobileChatHeight.min,
      PANEL_LIMITS.mobileChatHeight.max,
    ),
    sidebarCollapsed: stored.sidebarCollapsed ?? DEFAULT_LAYOUT.sidebarCollapsed,
  };
}

async function loadChatConfig() {
  try {
    const response = await fetch("/api/chat");
    if (!response.ok) return;
    const config = await response.json();
    const models = Array.isArray(config.models)
      ? config.models.filter(isChatModelOption).filter(isGeminiChatModelOption)
      : [];
    const selectedModel =
      models.find((option) => option.model === config.model) ||
      models[0] ||
      (isGeminiModelName(config.model)
        ? {
            model: config.model,
            provider: "gemini",
            label: modelLabelForConfig(config.model, "gemini"),
            webSearchSupported: true,
          }
        : null);
    state.chatConfig = {
      provider: "gemini",
      model: selectedModel?.model || "",
      modelLabel: selectedModel?.label || "Gemini",
      webSearchSupported: true,
      models,
    };
  } catch {
    // Chat still works without the metadata endpoint in static previews.
  }
}

function isChatModelOption(option) {
  return (
    option &&
    typeof option.model === "string" &&
    option.model.trim() &&
    typeof option.label === "string" &&
    option.label.trim()
  );
}

function isGeminiChatModelOption(option) {
  return isGeminiModelName(option.model) && (!option.provider || option.provider === "gemini");
}

function isGeminiModelName(model) {
  return /^gemini(?:-|$)/i.test(String(model || "").replace(/^models\//, "").trim());
}

function modelLabelForConfig(model, provider) {
  const cleanModel = String(model || "").replace(/^models\//, "").trim();
  if (!cleanModel) {
    if (provider === "gemini") return "Gemini";
    return "AI";
  }

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

function saveLayoutState() {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state.layout));
  } catch {
    // Layout persistence is optional.
  }
}

function loadReaderTabs() {
  try {
    const tabs = JSON.parse(sessionStorage.getItem(READER_TABS_STORAGE_KEY) || "[]");
    return Array.isArray(tabs) ? tabs.slice(0, MAX_READER_TABS) : [];
  } catch {
    return [];
  }
}

function saveReaderTabs() {
  try {
    sessionStorage.setItem(READER_TABS_STORAGE_KEY, JSON.stringify(state.readerTabs));
  } catch {
    // Tab persistence is optional.
  }
}

function chatStorageSuffix() {
  return state.snapshot?.manifest?.slug || "default";
}

function chatThreadsStorageKey() {
  return `${CHAT_THREADS_STORAGE_PREFIX}:${chatStorageSuffix()}`;
}

function activeChatThreadStorageKey() {
  return `${ACTIVE_CHAT_THREAD_STORAGE_PREFIX}:${chatStorageSuffix()}`;
}

function restoreChatThreads() {
  try {
    const threads = JSON.parse(localStorage.getItem(chatThreadsStorageKey()) || "[]");
    state.chatThreads = Array.isArray(threads) ? threads.slice(0, MAX_CHAT_THREADS) : [];
  } catch {
    state.chatThreads = [];
  }

  try {
    state.activeChatThreadId = localStorage.getItem(activeChatThreadStorageKey()) || "";
  } catch {
    state.activeChatThreadId = "";
  }

  const activeThread = state.chatThreads.find((thread) => thread.id === state.activeChatThreadId);
  state.messages = activeThread?.messages || [];
}

function saveChatThreads() {
  const nonEmptyThreads = state.chatThreads
    .filter((thread) => Array.isArray(thread.messages) && thread.messages.length > 0)
    .slice(0, MAX_CHAT_THREADS);
  state.chatThreads = nonEmptyThreads;
  try {
    localStorage.setItem(chatThreadsStorageKey(), JSON.stringify(nonEmptyThreads));
    localStorage.setItem(activeChatThreadStorageKey(), state.activeChatThreadId || "");
  } catch {
    // Chat persistence is optional.
  }
}

function isChatThreadAsking(threadId) {
  return Boolean(threadId && state.askingThreadIds.has(threadId));
}

function activeChatIsAsking() {
  return isChatThreadAsking(state.activeChatThreadId);
}

function chatThreadById(threadId) {
  return state.chatThreads.find((thread) => thread.id === threadId) || null;
}

function saveChatScrollPosition() {
  const messages = document.querySelector("[data-chat-messages]");
  const threadId = messages?.dataset.chatThreadId || "";
  if (!messages || !threadId) return;
  const thread = chatThreadById(threadId);
  if (!thread) return;

  const maxScrollTop = Math.max(0, messages.scrollHeight - messages.clientHeight);
  thread.chatScrollTop = Math.max(0, Math.min(messages.scrollTop, maxScrollTop));
  thread.chatStickToBottom = maxScrollTop - messages.scrollTop <= CHAT_SCROLL_BOTTOM_THRESHOLD;
}

function scheduleChatScrollSave() {
  if (chatScrollSaveFrame) return;
  chatScrollSaveFrame = requestAnimationFrame(() => {
    chatScrollSaveFrame = null;
    saveChatScrollPosition();
    saveChatThreads();
  });
}

function restoreChatScrollPosition({ forceBottom = false } = {}) {
  const threadId = state.activeChatThreadId;
  requestAnimationFrame(() => {
    const messages = document.querySelector("[data-chat-messages]");
    if (!messages) return;

    const thread = threadId ? chatThreadById(threadId) : null;
    const maxScrollTop = Math.max(0, messages.scrollHeight - messages.clientHeight);
    const hasSavedPosition = Number.isFinite(thread?.chatScrollTop);
    const shouldUseBottom =
      forceBottom ||
      !thread ||
      !hasSavedPosition ||
      thread.chatStickToBottom;

    messages.scrollTop = shouldUseBottom
      ? messages.scrollHeight
      : Math.max(0, Math.min(thread.chatScrollTop, maxScrollTop));
  });
}

function ensureActiveChatThread() {
  if (state.activeChatThreadId) {
    const existing = state.chatThreads.find((thread) => thread.id === state.activeChatThreadId);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const thread = {
    id: `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    initialContextLabel: currentChatContextLabel(),
    initialContextPageKey: currentChatContextPageKey(),
    messages: [],
  };
  state.activeChatThreadId = thread.id;
  state.chatThreads.unshift(thread);
  return thread;
}

function syncActiveChatThread() {
  const thread = ensureActiveChatThread();
  const firstUser = state.messages.find((message) => message.role === "user");
  thread.title = firstUser ? firstUser.text.replace(/\s+/g, " ").trim().slice(0, 54) : "New chat";
  thread.updatedAt = new Date().toISOString();
  thread.initialContextLabel = thread.initialContextLabel || currentChatContextLabel();
  thread.initialContextPageKey = thread.initialContextPageKey || currentChatContextPageKey();
  thread.messages = state.messages.slice();
  state.chatThreads = [
    thread,
    ...state.chatThreads.filter((item) => item.id !== thread.id),
  ].slice(0, MAX_CHAT_THREADS);
  saveChatThreads();
  return thread;
}

function appendMessageToChatThread(threadId, message, { markUnread = false } = {}) {
  const thread = state.chatThreads.find((item) => item.id === threadId);
  if (!thread) return null;

  const baseMessages =
    threadId === state.activeChatThreadId
      ? state.messages
      : Array.isArray(thread.messages)
        ? thread.messages
        : [];
  const nextMessages = [...baseMessages, message];
  const firstUser = nextMessages.find((item) => item.role === "user");
  thread.title = firstUser ? firstUser.text.replace(/\s+/g, " ").trim().slice(0, 54) : "New chat";
  thread.updatedAt = new Date().toISOString();
  thread.messages = nextMessages.slice();
  if (markUnread) {
    thread.unreadAnswer = true;
  } else if (threadId === state.activeChatThreadId) {
    thread.unreadAnswer = false;
  }
  state.chatThreads = [
    thread,
    ...state.chatThreads.filter((item) => item.id !== thread.id),
  ].slice(0, MAX_CHAT_THREADS);
  if (threadId === state.activeChatThreadId) {
    state.messages = thread.messages.slice();
  }
  saveChatThreads();
  return thread;
}

function createNewChat() {
  saveChatScrollPosition();
  state.messages = [];
  state.activeChatThreadId = "";
  state.chatHistoryOpen = false;
  saveChatThreads();
  render();
  focusChatInput();
}

function openChatThread(threadId) {
  saveChatScrollPosition();
  const thread = chatThreadById(threadId);
  if (!thread) return;
  if (thread.unreadAnswer) {
    thread.chatStickToBottom = true;
  }
  thread.unreadAnswer = false;
  state.activeChatThreadId = thread.id;
  state.messages = Array.isArray(thread.messages) ? thread.messages : [];
  state.chatHistoryOpen = false;
  saveChatThreads();
  const contextPage = latestChatContextPage(thread);
  if (contextPage && contextPage.key !== state.activePageKey) {
    navigate(contextPage.key);
    return;
  }
  render();
}

function deleteChatThread(threadId) {
  if (isChatThreadAsking(threadId)) return;
  saveChatScrollPosition();
  const threadIndex = state.chatThreads.findIndex((item) => item.id === threadId);
  if (threadIndex === -1) return;

  const wasActive = state.activeChatThreadId === threadId;
  state.chatThreads = state.chatThreads.filter((item) => item.id !== threadId);
  if (wasActive) {
    const nextThread = state.chatThreads[0] || null;
    state.activeChatThreadId = nextThread?.id || "";
    state.messages = Array.isArray(nextThread?.messages) ? nextThread.messages : [];
  }

  state.chatHistoryOpen = true;
  saveChatThreads();
  render();
}

function currentChatContextLabel() {
  return state.chatScope === "current" ? chatContextLabel() : "Whole wiki";
}

function currentChatContextPageKey() {
  if (state.chatScope !== "current") return "";
  return findPage(state.activePageKey)?.key || "";
}

function pageFromMessageContext(message) {
  if (!message) return null;
  if (message.contextPageKey) {
    const page = findPage(message.contextPageKey);
    if (page) return page;
  }

  if (message.contextPath) {
    const pageMatch = parsePageHref(message.contextPath);
    if (pageMatch) return findPage(pageMatch.pageKey);
  }

  const label = String(message.contextLabel || "").trim();
  if (!label || /^whole wiki$/i.test(label)) return null;
  if (/^wiki index$/i.test(label)) return findPage("index");
  return state.snapshot.pages.find((page) => page.title === label) || null;
}

function pageFromMessageReferences(message) {
  const references = Array.isArray(message?.references) ? message.references : [];
  for (const reference of references) {
    if (isWebReference(reference)) continue;
    const page = reference.pageKey ? findPage(reference.pageKey) : null;
    if (page) return page;
  }
  return null;
}

function latestChatContextPage(thread) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  for (const message of messages.slice().reverse()) {
    const contextPage = pageFromMessageContext(message) || pageFromMessageReferences(message);
    if (contextPage) return contextPage;
  }
  if (thread?.initialContextPageKey) return findPage(thread.initialContextPageKey);
  return null;
}

function chatHistoryForApi() {
  return state.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-CHAT_HISTORY_LIMIT)
    .map((message) => ({
      role: message.role,
      text:
        message.text.length > CHAT_HISTORY_TEXT_LIMIT
          ? `${message.text.slice(0, CHAT_HISTORY_TEXT_LIMIT)}\n\n[truncated]`
          : message.text,
      contextLabel: message.contextLabel || "",
      webSearchEnabled: Boolean(message.webSearchEnabled),
    }));
}

function readerTabForPage(page) {
  return {
    id: `page:${page.key}`,
    kind: "page",
    key: page.key,
    title: page.title,
    href: `${page.path}${location.hash || ""}`,
    scrollY: 0,
  };
}

function readerTabForSource(source) {
  return {
    id: `source:${source.path}`,
    kind: "source",
    sourcePath: source.path,
    title: source.title,
    href: `${source.url}${location.hash || ""}`,
    scrollY: 0,
  };
}

function currentReaderTabId() {
  const source = sourceFromLocation();
  if (source) return `source:${source.path}`;
  return `page:${findPage(state.activePageKey)?.key || "index"}`;
}

function ensureReaderTab(tab) {
  if (!tab) return;
  const existing = state.readerTabs.find((item) => item.id === tab.id);
  if (existing) {
    existing.title = tab.title;
    existing.href = tab.href;
    return;
  }

  state.readerTabs.push({ ...tab, openedAt: Date.now() });
  while (state.readerTabs.length > MAX_READER_TABS) {
    const activeId = tab.id;
    const removableIndex = state.readerTabs.findIndex((item) => item.id !== activeId);
    state.readerTabs.splice(removableIndex === -1 ? 0 : removableIndex, 1);
  }
  saveReaderTabs();
}

function saveActiveTabScroll() {
  const activeId = currentReaderTabId();
  const tab = state.readerTabs.find((item) => item.id === activeId);
  if (!tab) return;
  tab.scrollY = Math.max(0, window.scrollY || 0);
  saveReaderTabs();
}

function scheduleActiveTabScrollSave() {
  if (scrollSaveFrame) return;
  scrollSaveFrame = requestAnimationFrame(() => {
    scrollSaveFrame = null;
    saveActiveTabScroll();
  });
}

function activateReaderTab(tabId) {
  saveActiveTabScroll();
  const tab = state.readerTabs.find((item) => item.id === tabId);
  if (!tab) return;

  if (tab.kind === "source") {
    const source = findSource(tab.sourcePath);
    if (!source) return;
    state.sidebarTab = "sources";
    history.pushState(null, "", tab.href || source.url);
  } else {
    const page = findPage(tab.key);
    if (!page) return;
    state.activePageKey = page.key;
    state.sidebarTab = "pages";
    history.pushState(null, "", tab.href || page.path);
  }

  render();
  restoreReaderTabPosition(tab);
}

function closeReaderTab(tabId) {
  if (state.readerTabs.length <= 1) return;
  saveActiveTabScroll();

  const index = state.readerTabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;
  const isActive = currentReaderTabId() === tabId;
  state.readerTabs.splice(index, 1);
  saveReaderTabs();

  if (!isActive) {
    render();
    return;
  }

  const nextTab = state.readerTabs[Math.max(0, index - 1)] || state.readerTabs[0];
  activateReaderTab(nextTab.id);
}

function restoreReaderTabPosition(tab) {
  requestAnimationFrame(() => {
    if (tab.scrollY > 0) {
      window.scrollTo({ top: Math.max(0, tab.scrollY || 0), left: 0, behavior: "auto" });
      return;
    }

    const hash = new URL(tab.href || location.href, location.origin).hash.replace(/^#/, "");
    if (tab.kind === "page" && hash) {
      scrollToReaderPosition(decodeURIComponent(hash));
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function restoreReaderTabsScroll(scrollLeft) {
  const tabStrip = document.querySelector(".reader-tabs");
  if (!tabStrip || !scrollLeft) return;
  tabStrip.scrollLeft = scrollLeft;
}

function keepActiveReaderTabInView() {
  requestAnimationFrame(() => {
    const tabStrip = document.querySelector(".reader-tabs");
    const activeTab = tabStrip?.querySelector(".reader-tab-item.active");
    if (!tabStrip || !activeTab) return;

    const stripRect = tabStrip.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    const inset = 18;

    const intersectsStrip = tabRect.right > stripRect.left + inset && tabRect.left < stripRect.right - inset;
    if (intersectsStrip) return;

    const nextLeft =
      tabRect.left < stripRect.left
        ? tabStrip.scrollLeft + tabRect.left - stripRect.left - inset
        : tabStrip.scrollLeft + tabRect.right - stripRect.right + inset;

    tabStrip.scrollTo({
      left: Math.max(0, nextLeft),
      behavior: "auto",
    });
  });
}

function connectionsFor(kind, key) {
  const id = `${kind}:${key}`;
  const graph = getConnectionGraph();
  const connections = graph.get(id) || { incoming: [], outgoing: [] };
  return {
    kind,
    incoming: connections.incoming,
    outgoing: connections.outgoing,
    total: connections.incoming.length + connections.outgoing.length,
  };
}

function getConnectionGraph() {
  if (connectionGraph) return connectionGraph;

  const graph = new Map();
  const pages = state.snapshot.pages || [];
  const sources = state.snapshot.sources || [];

  pages.forEach((page) => {
    graph.set(connectionIdForPage(page.key), { incoming: [], outgoing: [] });
  });
  sources.forEach((source) => {
    graph.set(connectionIdForSource(source.path), { incoming: [], outgoing: [] });
  });

  pages.forEach((page) => {
    addOutgoingConnections(graph, pageSummary(page), extractInternalTargets(page.html || ""));
  });
  sources.forEach((source) => {
    addOutgoingConnections(graph, sourceSummary(source), extractInternalTargets(source.contentHtml || ""));
  });

  connectionGraph = graph;
  return connectionGraph;
}

function addOutgoingConnections(graph, from, targets) {
  const outgoing = graph.get(from.id)?.outgoing;
  if (!outgoing) return;

  const seen = new Set();
  targets.forEach((target) => {
    if (!target || target.id === from.id || seen.has(target.id)) return;
    seen.add(target.id);
    outgoing.push(target);

    const incoming = graph.get(target.id)?.incoming;
    if (incoming && !incoming.some((item) => item.id === from.id)) {
      incoming.push(from);
    }
  });
}

function extractInternalTargets(html) {
  if (!html) return [];
  const template = document.createElement("template");
  template.innerHTML = html;
  return [...template.content.querySelectorAll("a[href]")]
    .map((link) => connectionTargetFromHref(link.getAttribute("href")))
    .filter(Boolean);
}

function connectionTargetFromHref(href) {
  const sourceMatch = parseSourceHref(href);
  if (sourceMatch) {
    const source = findSource(sourceMatch.sourcePath);
    if (!source) return null;
    return sourceSummary(source, sourceMatch.fragment ? `${source.url}#${sourceMatch.fragment}` : source.url);
  }

  const pageMatch = parsePageHref(href);
  if (pageMatch) {
    const page = findPage(pageMatch.pageKey);
    if (!page) return null;
    return pageSummary(page, pageMatch.hash ? `${page.path}#${pageMatch.hash}` : page.path);
  }

  return null;
}

function pageSummary(page, href = page.path) {
  return {
    id: connectionIdForPage(page.key),
    kind: "page",
    title: page.title,
    label: pageFileLabel(page.key),
    href,
  };
}

function sourceSummary(source, href = source.url) {
  return {
    id: connectionIdForSource(source.path),
    kind: "source",
    title: source.title,
    label: sourceFileLabel(source.path),
    href,
  };
}

function connectionIdForPage(pageKey) {
  return `page:${pageKey}`;
}

function connectionIdForSource(sourcePath) {
  return `source:${sourcePath}`;
}

function pageFileLabel(pageKey) {
  if (pageKey === "index") return "index.md";
  return `${pageKey.split("/").filter(Boolean).pop() || pageKey}.md`;
}

function sourceFileLabel(sourcePath) {
  return decodeURIComponent(sourcePath.split("/").filter(Boolean).pop() || sourcePath);
}

function layoutValues() {
  const sidebarWidth = clamp(state.layout.sidebarWidth, PANEL_LIMITS.sidebar.min, PANEL_LIMITS.sidebar.max);
  const chatWidth = clamp(state.layout.chatWidth, PANEL_LIMITS.chat.min, PANEL_LIMITS.chat.max);
  const mobileChatHeight = clamp(
    Number(state.layout.mobileChatHeight) || DEFAULT_LAYOUT.mobileChatHeight,
    PANEL_LIMITS.mobileChatHeight.min,
    PANEL_LIMITS.mobileChatHeight.max,
  );

  return {
    "sidebar-width": `${sidebarWidth}px`,
    "chat-width": `${chatWidth}px`,
    "mobile-chat-height": String(mobileChatHeight),
    "sidebar-column": state.layout.sidebarCollapsed ? "0px" : `${sidebarWidth}px`,
    "sidebar-rail": state.layout.sidebarCollapsed ? "0px" : "1px",
    "chat-rail": "1px",
    "chat-column": `${chatWidth}px`,
  };
}

function layoutStyle() {
  return Object.entries(layoutValues())
    .map(([property, value]) => `--${property}: ${value}`)
    .join("; ");
}

function applyLayoutVariables() {
  const shell = document.querySelector(".shell");
  if (!shell) return;
  Object.entries(layoutValues()).forEach(([property, value]) => {
    shell.style.setProperty(`--${property}`, value);
  });
}

function togglePanel(panel) {
  if (panel === "sidebar") {
    state.layout.sidebarCollapsed = !state.layout.sidebarCollapsed;
    document.body.classList.remove("show-sidebar");
  } else {
    return;
  }

  saveLayoutState();
  render();
}

function bindPanelResizers() {
  document.querySelectorAll("[data-panel-resizer]").forEach((handle) => {
    handle.addEventListener("pointerdown", startPanelResize);
  });
}

function startPanelResize(event) {
  const panel = event.currentTarget.getAttribute("data-panel-resizer");
  if (!PANEL_LIMITS[panel] || window.matchMedia("(max-width: 820px)").matches) return;
  if (panel === "chat" && window.matchMedia("(max-width: 1100px)").matches) return;
  if (panel === "sidebar" && state.layout.sidebarCollapsed) return;

  event.preventDefault();
  const handle = event.currentTarget;
  const startX = event.clientX;
  const widthKey = panel === "chat" ? "chatWidth" : "sidebarWidth";
  const startWidth = state.layout[widthKey];
  const pointerId = event.pointerId;

  handle.setPointerCapture?.(pointerId);
  handle.classList.add("active");
  document.body.classList.add("is-resizing-panel");

  const onMove = (moveEvent) => {
    const delta = moveEvent.clientX - startX;
    const nextWidth = panel === "chat" ? startWidth - delta : startWidth + delta;
    state.layout[widthKey] = clamp(nextWidth, PANEL_LIMITS[panel].min, PANEL_LIMITS[panel].max);
    applyLayoutVariables();
  };

  const stopResize = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", stopResize);
    window.removeEventListener("pointercancel", stopResize);
    handle.releasePointerCapture?.(pointerId);
    handle.classList.remove("active");
    document.body.classList.remove("is-resizing-panel");
    saveLayoutState();
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
}

function setMobileChatHeight(nextHeight) {
  state.layout.mobileChatHeight = clamp(
    nextHeight,
    PANEL_LIMITS.mobileChatHeight.min,
    PANEL_LIMITS.mobileChatHeight.max,
  );
  applyLayoutVariables();
}

function startMobileChatHeightDrag(event) {
  if (!window.matchMedia("(max-width: 559px)").matches) return;
  if (!document.body.classList.contains("show-chat")) return;

  event.preventDefault();
  const handle = event.currentTarget;
  const pointerId = event.pointerId;
  const viewportHeight = window.visualViewport?.height || window.innerHeight || 1;
  const startY = event.clientY;
  const startHeight = clamp(
    Number(state.layout.mobileChatHeight) || DEFAULT_LAYOUT.mobileChatHeight,
    PANEL_LIMITS.mobileChatHeight.min,
    PANEL_LIMITS.mobileChatHeight.max,
  );

  handle.setPointerCapture?.(pointerId);
  handle.classList.add("active");
  document.body.classList.add("is-resizing-chat-sheet");

  const onMove = (moveEvent) => {
    const deltaPercent = ((startY - moveEvent.clientY) / viewportHeight) * 100;
    setMobileChatHeight(startHeight + deltaPercent);
  };

  const stopDrag = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
    handle.releasePointerCapture?.(pointerId);
    handle.classList.remove("active");
    document.body.classList.remove("is-resizing-chat-sheet");
    saveLayoutState();
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);
}

function adjustMobileChatHeight(delta) {
  setMobileChatHeight(
    (Number(state.layout.mobileChatHeight) || DEFAULT_LAYOUT.mobileChatHeight) + delta,
  );
  saveLayoutState();
}

function focusChatInput() {
  requestAnimationFrame(() => {
    const panel = document.querySelector("[data-chat-panel]");
    if (!document.body.classList.contains("show-chat")) {
      panel?.scrollIntoView({ block: "nearest" });
    }
    panel?.querySelector("textarea")?.focus();
  });
}

function readerGuidePage() {
  const manifest = state.snapshot.manifest;
  const chatEnabled = manifest.chatEnabled !== false;
  const sourcePolicyLabel =
    manifest.sourcePolicy === "all_sources_public_by_default"
      ? "Sources are published by default for this snapshot."
      : "Source visibility follows this wiki's publish settings.";
  const generatedAt = manifest.generatedAt ? formatDate(manifest.generatedAt) : "";
  const text = [
    `Reader Guide`,
    `This is a deterministic guide for reading ${manifest.title}.`,
    `Use Wiki to browse generated pages, Sources to inspect original files, and Connections to understand how documents relate.`,
    chatEnabled ? `Use Ask Wiki to chat with the published snapshot.` : `Chat is disabled for this published snapshot.`,
  ].join("\n\n");

  return {
    key: READER_GUIDE_KEY,
    title: "Reader Guide",
    path: `/${manifest.slug}/${READER_GUIDE_KEY}`,
    type: "start",
    virtual: true,
    updated: generatedAt || null,
    text,
    html: `
      <p class="reader-guide-lede">
        This page explains how to use <strong>${escapeHtml(manifest.title)}</strong> as a published Maple wiki.
        It is generated from the publish snapshot, so it describes the web reader rather than the underlying study content.
      </p>

      <section class="reader-guide-panel">
        <h2>What You Are Reading</h2>
        <p>
          This site is a read-only published snapshot of a local Maple workspace.
          The wiki pages, source files, assets, search data, and chat context were exported at publish time.
        </p>
        <dl class="reader-guide-facts">
          <div>
            <dt>Pages</dt>
            <dd>${escapeHtml(String(manifest.pageCount || 0))}</dd>
          </div>
          <div>
            <dt>Public sources</dt>
            <dd>${escapeHtml(String(manifest.publicSourceCount || 0))}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>${generatedAt ? escapeHtml(generatedAt) : "Unknown"}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>Browse the Wiki</h2>
        <p>
          Use the left panel's <strong>Wiki</strong> tab to move through the generated pages.
          The main sections are Guides, Concepts, and Summaries. Opened documents stay available as tabs above the reader.
        </p>
        <p>
          <a href="/${escapeHtml(manifest.slug)}">Open the Wiki Index</a> when you want the content-oriented start page for this specific wiki.
        </p>
      </section>

      <section>
        <h2>Inspect Sources</h2>
        <p>
          Use the left panel's <strong>Sources</strong> tab, or click citations inside wiki pages, to inspect the original published materials.
          Markdown and text sources open with line numbers. PDFs open in the site with continuous scrolling.
        </p>
        <p>${escapeHtml(sourcePolicyLabel)}</p>
      </section>

      <section>
        <h2>Use Connections</h2>
        <p>
          The <strong>Connections</strong> button shows which pages link to the current document and which pages or sources the current document links out to.
          It is useful when you follow a citation or jump between concepts and need to recover the surrounding context.
        </p>
      </section>

      <section>
        <h2>Search and Tabs</h2>
        <p>
          Search filters published wiki pages from the left panel. Reader tabs preserve recently opened pages and sources so you can follow links without losing your previous place.
        </p>
      </section>

      <section>
        <h2>Ask This Wiki</h2>
        <p>
          ${
            chatEnabled
              ? "The right-side Ask Wiki panel answers against the published snapshot. It can use public pages, citations, and published source context, but it does not edit the wiki."
              : "Chat is not enabled for this published snapshot."
          }
        </p>
      </section>
    `,
  };
}

function renderNav() {
  const query = state.searchQuery.trim().toLowerCase();
  if (query) return renderSearchResults(searchPages(query));

  const indexPage = findPage("index");
  return `
    <section class="nav-section">
      <h3>Start</h3>
      ${renderPageLink(readerGuidePage())}
      ${renderPageLink(indexPage, { label: "Wiki Index" })}
    </section>
    ${renderTreeRoot("guides", "Guides")}
    ${renderTreeRoot("concepts", "Concepts")}
    ${renderTreeRoot("summaries", "Summaries")}
    ${renderAdditionalPageRoots()}
  `;
}

function renderAdditionalPageRoots() {
  const roots = [
    ...new Set(
      state.snapshot.pages
        .map((page) => page.type)
        .filter((type) => type && !PRIMARY_PAGE_TYPES.has(type)),
    ),
  ];
  return roots
    .sort((a, b) => titleCase(a).localeCompare(titleCase(b)))
    .map((root) => renderTreeRoot(root, titleCase(root)))
    .join("");
}

function renderSearchResults(pages) {
  return `
    <section class="nav-section">
      <h3>Search Results</h3>
      ${pages.length ? pages.map(renderPageLink).join("") : `<p class="nav-empty">No matching pages</p>`}
    </section>
  `;
}

function renderTreeRoot(root, label) {
  const pages = state.snapshot.pages.filter((page) => page.type === root);
  if (!pages.length) return "";

  if (root === "guides") {
    return `
      <section class="nav-section">
        <h3>${label}</h3>
        ${pages.map(renderPageLink).join("")}
      </section>
    `;
  }

  if (root === "concepts") {
    return renderConceptTree(label, pages);
  }

  const folders = groupByFolder(pages, root);
  return `
    <section class="nav-section">
      <h3>${label}</h3>
      ${Object.entries(folders)
        .sort(([a], [b]) => folderSortKey(root, a).localeCompare(folderSortKey(root, b)))
        .map(
          ([folder, items]) => {
            const isActiveFolder = items.some((page) => page.key === state.activePageKey);
            return `
            <details class="nav-folder" ${isActiveFolder ? "open" : ""}>
              <summary>
                <span>${escapeHtml(folder)}</span>
                <small>${items.length}</small>
              </summary>
              <div class="folder-items">
                ${items.map(renderPageLink).join("")}
              </div>
            </details>
          `;
          },
        )
        .join("")}
    </section>
  `;
}

function renderConceptTree(label, pages) {
  const folders = groupConceptPages(pages);
  return `
    <section class="nav-section">
      <h3>${label}</h3>
      ${folders
        .sort((a, b) => folderSortKey("concepts", a.label).localeCompare(folderSortKey("concepts", b.label)))
        .map((folder) => {
          const isActiveFolder = folder.pages.some((page) => page.key === state.activePageKey);
          return `
            <details class="nav-folder" ${isActiveFolder ? "open" : ""}>
              <summary>
                <span>${escapeHtml(folder.label)}</span>
                <small>${folder.pages.length}</small>
              </summary>
              <div class="folder-items">
                ${folder.directPages.map(renderPageLink).join("")}
                ${folder.subfolders
                  .sort((a, b) => a.label.localeCompare(b.label))
                  .map((subfolder) => {
                    const isActiveSubfolder = subfolder.pages.some((page) => page.key === state.activePageKey);
                    return `
                      <details class="nav-folder nav-subfolder" ${isActiveSubfolder ? "open" : ""}>
                        <summary>
                          <span>${escapeHtml(subfolder.label)}</span>
                          <small>${subfolder.pages.length}</small>
                        </summary>
                        <div class="folder-items">
                          ${subfolder.pages.map(renderPageLink).join("")}
                        </div>
                      </details>
                    `;
                  })
                  .join("")}
              </div>
            </details>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderPageLink(page, options = {}) {
  if (!page) return "";
  const label = options.label || page.title;
  const isActive = page.key === state.activePageKey;
  return `
    <div class="page-link-row">
      <a
        class="page-link ${isActive ? "active" : ""}"
        href="${page.path}"
        data-route="${escapeHtml(page.key)}"
      >
        <span>${escapeHtml(label)}</span>
      </a>
      ${isActive && page.unit?.tabs?.length ? renderUnitSidebarTabs(page) : ""}
    </div>
  `;
}

function renderUnitSidebarTabs(page) {
  return `
    <div class="unit-sidebar-tabs">
      ${page.unit.tabs.map((tab) => `
        <button
          class="unit-sidebar-tab ${activeUnitTab(page).id === tab.id ? "active" : ""}"
          type="button"
          data-unit-tab="${escapeHtml(tab.id)}"
        >
          ${escapeHtml(tab.label)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderReaderTabs(activeTabId) {
  const tabs = state.readerTabs.filter((tab) => {
    if (tab.kind === "source") return Boolean(findSource(tab.sourcePath));
    return Boolean(findPage(tab.key));
  });
  if (!tabs.length) return "";

  return `
    <div class="reader-tabs" role="tablist" aria-label="Open wiki documents">
      ${tabs
        .map(
          (tab) => `
            <div class="reader-tab-item ${tab.id === activeTabId ? "active" : ""}">
              <button
                class="reader-tab"
                type="button"
                role="tab"
                aria-selected="${tab.id === activeTabId ? "true" : "false"}"
                data-reader-tab="${escapeHtml(tab.id)}"
                title="${escapeHtml(tab.title)}"
              >
                <small title="${tab.kind === "source" ? "Source" : "Wiki"}">${tab.kind === "source" ? "S" : "W"}</small>
                <span>${escapeHtml(tab.title)}</span>
              </button>
              ${
                tabs.length > 1
                  ? `<button
                      class="reader-tab-close"
                      type="button"
                      data-reader-tab-close="${escapeHtml(tab.id)}"
                      aria-label="Close ${escapeHtml(tab.title)}"
                    >×</button>`
                  : ""
              }
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderPageReader(page) {
  if (page.unit?.tabs?.length) return renderUnitPageReader(page);
  const showConnections = !page.virtual;
  const connections = showConnections ? connectionsFor("page", page.key) : null;
  return `
    <div class="reader-topbar">
      <div>
        <p>${escapeHtml(pageBreadcrumb(page))}</p>
        <h1>${escapeHtml(page.title)}</h1>
        <div class="page-meta">
          <span>${escapeHtml(readingTime(page.text))}</span>
          ${
            page.virtual
              ? `<span>Generated guide</span>`
              : `<span>${escapeHtml(sourceCountForPage(page))} sources listed</span>`
          }
          ${page.updated ? `<span>Updated ${escapeHtml(formatDate(page.updated))}</span>` : ""}
        </div>
      </div>
    </div>
    ${showConnections ? renderConnectionsBadge(connections) : ""}
    <article class="wiki-content">
      ${page.html}
    </article>
  `;
}

function renderUnitPageReader(page) {
  const connections = connectionsFor("page", page.key);
  const unit = page.unit;
  const tab = activeUnitTab(page);
  return `
    <section class="unit-hero">
      <div class="unit-breadcrumb">
        <span>${escapeHtml(titleCase(unit.subject || page.type || "Wiki"))}</span>
        <span aria-hidden="true">›</span>
        <strong>${escapeHtml(unit.unitId || page.title)}</strong>
      </div>
      <h1>${escapeHtml(unit.title || page.title)}</h1>
      ${unit.subtitle ? `<p>${escapeHtml(unit.subtitle)}</p>` : ""}
      <div class="unit-tags" aria-label="Unit metadata">
        ${unit.subject ? `<span class="unit-tag subject">${escapeHtml(titleCase(unit.subject))}</span>` : ""}
        ${unit.level ? `<span class="unit-tag level">${escapeHtml(unit.level)}</span>` : ""}
        <span class="unit-tag neutral">${escapeHtml(readingTime(page.text))}</span>
        <span class="unit-tag neutral">${escapeHtml(sourceCountForPage(page))} sources listed</span>
      </div>
    </section>
    <div class="unit-tab-bar" role="tablist" aria-label="Unit sections">
      ${unit.tabs.map((item) => `
        <button
          class="unit-tab ${item.id === tab.id ? "active" : ""}"
          type="button"
          role="tab"
          aria-selected="${item.id === tab.id ? "true" : "false"}"
          data-unit-tab="${escapeHtml(item.id)}"
        >
          ${escapeHtml(item.label)}
        </button>
      `).join("")}
    </div>
    <section class="unit-panel" data-unit-panel="${escapeHtml(tab.id)}">
      ${tab.overviewHtml ? `
        <div class="unit-overview-card">
          <div class="unit-card-label">Overview</div>
          <div class="unit-card-body">${tab.overviewHtml}</div>
        </div>
      ` : ""}
      ${tab.cards.length ? `
        <div class="unit-card-list">
          ${tab.cards.map((card) => renderUnitCard(card, tab.id)).join("")}
        </div>
      ` : `
        <div class="unit-empty">
          <p>No ${escapeHtml(tab.label.toLowerCase())} have been published for this unit yet.</p>
        </div>
      `}
    </section>
    ${renderConnectionsBadge(connections)}
  `;
}

function activeUnitTab(page) {
  return (
    page.unit?.tabs?.find((tab) => tab.id === state.unitTab) ||
    page.unit?.tabs?.[0] || {
      id: "overview",
      label: "Overview",
      overviewHtml: page.html,
      cards: [],
    }
  );
}

function renderUnitCard(card, tabId) {
  return `
    <article class="unit-card ${tabId === "problem-patterns" ? "pattern" : "concept"}">
      <button class="unit-card-header" type="button" data-card-toggle aria-expanded="true">
        ${card.code ? `<span class="unit-card-code">${escapeHtml(card.code)}</span>` : ""}
        <span class="unit-card-title">${escapeHtml(card.title)}</span>
        ${card.level ? `<span class="unit-card-tag">${escapeHtml(card.level)}</span>` : ""}
        <span class="unit-card-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="unit-card-content">
        <div class="unit-card-body">${card.html}</div>
        ${card.keywords?.length ? `
          <div class="unit-keywords" aria-label="Keywords">
            ${card.keywords.slice(0, 10).map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}
          </div>
        ` : ""}
      </div>
    </article>
  `;
}

function renderSourceReader(source) {
  const connections = connectionsFor("source", source.path);
  return `
    <div class="reader-topbar source-topbar">
      <div>
        <p>${escapeHtml(sourceGroupLabel(source.path))}</p>
        <h1>${escapeHtml(source.title)}</h1>
        <div class="page-meta">
          <span>${escapeHtml(source.type.toUpperCase())}</span>
          <span>${escapeHtml(formatBytes(source.size))}</span>
        </div>
      </div>
    </div>
    ${renderConnectionsBadge(connections)}
    <article class="source-viewer ${source.type === "pdf" ? "source-viewer-pdf" : ""}">
      ${renderSourceBody(source)}
    </article>
  `;
}

function renderConnectionsBadge(connections) {
  return `
    <div class="connections-badge ${state.connectionsOpen ? "open" : ""}" data-connections-badge>
      ${renderConnectionsToggle(connections)}
      ${renderConnectionsPanel(connections)}
    </div>
  `;
}

function renderConnectionsToggle(connections) {
  return `
    <button
      class="connections-toggle ${state.connectionsOpen ? "active" : ""}"
      type="button"
      data-connections-toggle
      aria-controls="connections-panel"
      aria-expanded="${state.connectionsOpen ? "true" : "false"}"
    >
      <span data-connections-label>${state.connectionsOpen ? "Hide connections" : "Connections"}</span>
      <strong>${connections.total}</strong>
    </button>
  `;
}

function renderConnectionsPanel(connections) {
  const outgoingLabel = connections.kind === "source" ? "Links from this source" : "Links from this page";
  return `
    <aside
      id="connections-panel"
      class="connections-panel ${state.connectionsOpen ? "open" : ""}"
      data-connections-panel
      aria-label="Document connections"
      aria-hidden="${state.connectionsOpen ? "false" : "true"}"
      ${state.connectionsOpen ? "" : "inert"}
    >
      ${renderConnectionGroup("Linked from", connections.incoming)}
      ${renderConnectionGroup(outgoingLabel, connections.outgoing)}
    </aside>
  `;
}

function syncConnectionsPanel() {
  const badge = document.querySelector("[data-connections-badge]");
  const button = document.querySelector("[data-connections-toggle]");
  const panel = document.querySelector("[data-connections-panel]");
  if (!button || !panel) return;

  const isOpen = state.connectionsOpen;
  badge?.classList.toggle("open", isOpen);
  button.classList.toggle("active", isOpen);
  button.setAttribute("aria-expanded", isOpen ? "true" : "false");
  button.querySelector("[data-connections-label]").textContent = isOpen ? "Hide connections" : "Connections";

  panel.classList.toggle("open", isOpen);
  panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
  panel.inert = !isOpen;
}

function toggleConnectionsPanel() {
  state.connectionsOpen = !state.connectionsOpen;
  syncConnectionsPanel();
}

function renderConnectionGroup(label, items) {
  return `
    <section class="connection-group">
      <h2>${escapeHtml(label)} <span>(${items.length})</span></h2>
      ${
        items.length
          ? `<div class="connection-list">
              ${items.map(renderConnectionLink).join("")}
            </div>`
          : `<p class="connection-empty">No internal connections</p>`
      }
    </section>
  `;
}

function renderConnectionLink(item) {
  return `
    <a class="connection-link" href="${escapeHtml(item.href)}" title="${escapeHtml(item.title)}">
      <small>${item.kind === "source" ? "S" : "W"}</small>
      <span>${escapeHtml(item.label)}</span>
    </a>
  `;
}

function renderChatPanel() {
  const contextLabel = currentChatContextLabel();
  const webSearchSupported = state.chatConfig.webSearchSupported !== false;
  const chatIsAsking = activeChatIsAsking();
  return `
    <aside class="chat-panel" data-chat-panel>
      <div
        class="chat-sheet-drag-handle"
        data-chat-height-handle
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize Ask Wiki panel"
        tabindex="0"
      ></div>
      <div class="chat-header">
        <div class="chat-heading">
          <h2>Ask Wiki</h2>
          <p data-chat-context-label title="${escapeHtml(contextLabel)}">${escapeHtml(contextLabel)}</p>
        </div>
        <div class="chat-header-actions">
          <button class="chat-header-btn" type="button" data-chat-new title="New chat" aria-label="New chat">
            +
          </button>
          <button
            class="chat-header-btn ${state.chatHistoryOpen ? "active" : ""}"
            type="button"
            data-chat-history-toggle
            title="Chat history"
            aria-label="Chat history"
            aria-pressed="${state.chatHistoryOpen ? "true" : "false"}"
          >
            History
          </button>
          <button class="chat-header-btn chat-close-btn" type="button" data-chat-close title="Close Ask Wiki" aria-label="Close Ask Wiki">
            ×
          </button>
        </div>
        ${state.chatHistoryOpen ? renderChatHistoryPopover() : ""}
      </div>
      <div class="chat-messages" data-chat-messages data-chat-thread-id="${escapeHtml(state.activeChatThreadId)}">
        ${renderMessages()}
      </div>
      <form class="chat-form" data-chat-form>
        <div class="chat-scope-row" role="group" aria-label="Chat scope">
          <span>Scope</span>
          <div class="chat-scope-control">
            <button
              class="chat-scope-option ${state.chatScope === "current" ? "active" : ""}"
              type="button"
              data-chat-scope="current"
              aria-pressed="${state.chatScope === "current" ? "true" : "false"}"
              ${chatIsAsking ? "disabled" : ""}
            >
              This page
            </button>
            <button
              class="chat-scope-option ${state.chatScope === "wiki" ? "active" : ""}"
              type="button"
              data-chat-scope="wiki"
              aria-pressed="${state.chatScope === "wiki" ? "true" : "false"}"
              ${chatIsAsking ? "disabled" : ""}
            >
              Whole wiki
            </button>
          </div>
        </div>
        <textarea
          name="question"
          rows="3"
          placeholder="Ask about ${state.chatScope === "current" ? "this page" : "this wiki"}..."
          ${chatIsAsking ? "disabled" : ""}
        ></textarea>
        <div class="chat-composer-footer">
          <div class="chat-model-controls">
            ${renderChatModelPicker()}
            <button
              class="chat-tool-button ${state.webSearch ? "active" : ""}"
              type="button"
              data-web-search-toggle
              aria-label="${webSearchSupported ? (state.webSearch ? "Disable internet search" : "Allow internet search") : "Internet search is unavailable for this model"}"
              title="${webSearchSupported ? (state.webSearch ? "Internet search enabled" : "Allow internet search when needed") : "Internet search is unavailable for this model"}"
              aria-pressed="${state.webSearch ? "true" : "false"}"
              ${chatIsAsking || !webSearchSupported ? "disabled" : ""}
            >
              ${renderGlobeIcon("globe-icon")}
            </button>
          </div>
          <button class="chat-submit" type="submit" aria-label="Ask" title="Ask" ${chatIsAsking ? "disabled" : ""}>
            ${chatIsAsking ? `<span class="chat-submit-dot" aria-hidden="true"></span>` : renderSendIcon("send-icon")}
          </button>
        </div>
      </form>
    </aside>
  `;
}

function renderChatModelPicker() {
  const options = chatModelOptionsForUi();
  const chatIsAsking = activeChatIsAsking();
  return `
    <label class="chat-model-picker">
      <span class="sr-only">Chat model</span>
      <select data-chat-model aria-label="Chat model" ${chatIsAsking ? "disabled" : ""}>
        ${options
          .map(
            (option) => `
              <option value="${escapeHtml(option.model)}" ${option.model === state.chatConfig.model ? "selected" : ""}>
                ${escapeHtml(option.label)}
              </option>
            `,
          )
          .join("")}
      </select>
    </label>
  `;
}

function chatModelOptionsForUi() {
  if (state.chatConfig.models.length) return state.chatConfig.models.filter(isGeminiChatModelOption);
  const model = isGeminiModelName(state.chatConfig.model) ? state.chatConfig.model : "";
  return [
    {
      model,
      provider: "gemini",
      label: state.chatConfig.modelLabel || modelLabelForConfig(model, "gemini"),
      webSearchSupported: true,
    },
  ].filter((option) => option.model);
}

function chatContextLabel() {
  const page = findPage(state.activePageKey);
  if (!page) return state.snapshot?.manifest?.title || "Published wiki";
  return page.key === "index" ? "Wiki Index" : page.title;
}

function renderChatHistoryPopover() {
  if (!state.chatThreads.length) {
    return `
      <div class="chat-history-popover">
        <div class="chat-history-title">Chats</div>
        <div class="chat-history-empty">No saved chats yet.</div>
      </div>
    `;
  }

  return `
    <div class="chat-history-popover">
      <div class="chat-history-title">Chats</div>
      <ul class="chat-history-list">
        ${state.chatThreads
          .map((thread) => {
            const title = chatThreadTitle(thread);
            const preview = chatThreadPreview(thread);
            const isActive = thread.id === state.activeChatThreadId;
            const activity = chatThreadActivity(thread);
            const showMarker = activity.status === "running" || activity.status === "ready";
            return `
              <li class="chat-history-row">
                <button
                  class="chat-history-item ${isActive ? "active" : ""} status-${activity.status}"
                  type="button"
                  data-chat-thread="${escapeHtml(thread.id)}"
                  title="${escapeHtml(`${title} - ${activity.label}`)}"
                >
                  <span class="chat-history-main">
                    <span class="chat-history-name">${escapeHtml(title)}</span>
                    ${
                      showMarker
                        ? `<span class="chat-thread-status-dot status-${activity.status}" aria-label="${escapeHtml(activity.label)}" title="${escapeHtml(activity.label)}"></span>`
                        : ""
                    }
                  </span>
                  <span class="chat-history-preview">${escapeHtml(preview)}</span>
                </button>
                <button
                  class="chat-history-delete"
                  type="button"
                  data-chat-delete="${escapeHtml(thread.id)}"
                  aria-label="Delete chat: ${escapeHtml(title)}"
                  title="${activity.status === "running" ? "Wait for this answer to finish before deleting it." : "Delete chat"}"
                  ${activity.status === "running" ? "disabled" : ""}
                >
                  x
                </button>
              </li>
            `;
          })
          .join("")}
      </ul>
    </div>
  `;
}

function chatThreadActivity(thread) {
  if (isChatThreadAsking(thread?.id)) {
    return { status: "running", label: "Preparing answer" };
  }
  if (thread?.unreadAnswer) {
    return { status: "ready", label: "Answer ready" };
  }
  if (!Array.isArray(thread?.messages) || thread.messages.length === 0) {
    return { status: "empty", label: "No messages yet" };
  }
  return { status: "finished", label: "Finished" };
}

function chatThreadTitle(thread) {
  const title = String(thread?.title || "").trim();
  if (title) return title;
  const firstUser = (thread?.messages || []).find((message) => message.role === "user" && message.text?.trim());
  return firstUser ? firstUser.text.replace(/\s+/g, " ").trim().slice(0, 54) : "New chat";
}

function chatThreadPreview(thread) {
  const lastMessage = [...(thread?.messages || [])]
    .reverse()
    .find((message) => message.text?.trim());
  if (!lastMessage) return thread?.initialContextLabel || "Empty chat";
  const speaker = lastMessage.role === "user" ? "You" : "Ask Wiki";
  const text = lastMessage.text.replace(/\s+/g, " ").trim().slice(0, 80);
  return `${speaker}: ${text}`;
}

function renderSourceBody(source) {
  const fragment = sourceFragmentFromLocation();
  if (source.type === "pdf") {
    const initialPage = pdfPageFromFragment(fragment);
    return `
      <div
        class="pdf-viewer"
        data-pdf-viewer
        data-source-path="${escapeHtml(source.path)}"
        data-initial-page="${initialPage}"
      >
        <div class="pdf-toolbar">
          <div class="pdf-toolbar-main">
            <button type="button" data-pdf-prev aria-label="Previous page">‹</button>
            <label>
              <span>Page</span>
              <input type="number" min="1" value="${initialPage}" data-pdf-page />
              <span data-pdf-count>/ …</span>
            </label>
            <button type="button" data-pdf-next aria-label="Next page">›</button>
          </div>
          <div class="pdf-toolbar-actions">
            <button type="button" data-pdf-zoom-out aria-label="Zoom out">−</button>
            <span data-pdf-zoom-label>100%</span>
            <button type="button" data-pdf-zoom-in aria-label="Zoom in">+</button>
          </div>
        </div>
        <div class="pdf-stage" data-pdf-stage>
          <div class="pdf-pages" data-pdf-pages></div>
          <div class="pdf-loading" data-pdf-status>Loading PDF</div>
        </div>
      </div>
    `;
  }

  if (source.type === "markdown" || source.type === "text") {
    return `
      <div
        class="source-code-viewer"
        data-source-code
        data-source-path="${escapeHtml(source.path)}"
        data-source-url="${escapeHtml(source.rawUrl)}"
        data-source-fragment="${escapeHtml(fragment)}"
      >
        <div class="source-code-status">Loading source</div>
      </div>
    `;
  }

  if (source.contentHtml) {
    return `<div class="wiki-content source-content">${source.contentHtml}</div>`;
  }

  return `
    <div class="source-fallback">
      <p>This source type is available in the published source snapshot.</p>
    </div>
  `;
}

function renderSourceNav() {
  const sources = state.snapshot.sources || [];
  if (!sources.length) return "";
  const query = state.searchQuery.trim().toLowerCase();

  if (query) {
    const matches = sources.filter((source) => {
      const haystack = `${source.title} ${source.path} ${source.type}`.toLowerCase();
      return haystack.includes(query);
    });
    return `
      <section class="nav-section">
        <h3>Source Results</h3>
        ${matches.length ? matches.map(renderSourceLink).join("") : `<p class="nav-empty">No matching sources</p>`}
      </section>
    `;
  }

  const tree = buildSourceTree(sources);

  return `
    <section class="nav-section">
      <h3>Sources</h3>
      ${renderSourceTreeChildren(tree, 0)}
    </section>
  `;
}

function buildSourceTree(sources) {
  const root = { children: new Map(), sources: [] };

  for (const source of sources) {
    const parts = source.path.replace(/^sources\//, "").split("/");
    const folders = parts.slice(0, -1);
    let node = root;

    for (const folder of folders) {
      if (!node.children.has(folder)) {
        node.children.set(folder, { name: folder, children: new Map(), sources: [] });
      }
      node = node.children.get(folder);
    }

    node.sources.push(source);
  }

  return root;
}

function renderSourceTreeChildren(node, depth) {
  const folders = [...node.children.entries()]
    .sort(([a], [b]) => sourceTreeSortKey(a).localeCompare(sourceTreeSortKey(b)))
    .map(([, child]) => renderSourceTreeNode(child, depth));
  const files = [...node.sources]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(renderSourceLink);

  return [...folders, ...files].join("");
}

function renderSourceTreeNode(node, depth) {
  const activePath = sourcePathFromLocation();
  const isActiveFolder = sourceTreeContains(node, activePath);
  const count = countSourceTreeFiles(node);

  return `
    <details class="source-folder source-folder-depth-${depth}" ${isActiveFolder ? "open" : ""}>
      <summary>
        <span>${escapeHtml(sourceFolderLabel(node.name))}</span>
        <small>${count}</small>
      </summary>
      <div class="folder-items">
        ${renderSourceTreeChildren(node, depth + 1)}
      </div>
    </details>
  `;
}

function sourceTreeContains(node, sourcePath) {
  if (!sourcePath) return false;
  if (node.sources.some((source) => source.path === sourcePath)) return true;
  return [...node.children.values()].some((child) => sourceTreeContains(child, sourcePath));
}

function countSourceTreeFiles(node) {
  return (
    node.sources.length +
    [...node.children.values()].reduce((sum, child) => sum + countSourceTreeFiles(child), 0)
  );
}

function sourceFolderLabel(folderName) {
  return titleCase(folderName);
}

function sourceTreeSortKey(folderName) {
  const order = [
    "application-notes",
    "chatgpt-shares",
    "lectures",
    "papers",
    "textbooks",
    "web-clippings",
  ];
  const index = order.indexOf(folderName);
  return `${index === -1 ? 99 : index}`.padStart(2, "0") + sourceFolderLabel(folderName);
}

function renderSourceLink(source) {
  return `
    <a
      class="source-link ${source.path === sourcePathFromLocation() ? "active" : ""}"
      href="${source.url}"
      data-source-route="${escapeHtml(source.path)}"
    >
      <span>${escapeHtml(source.title)}</span>
      <small>${escapeHtml(source.type.toUpperCase())}</small>
    </a>
  `;
}

function renderMessages() {
  if (!state.messages.length) {
    return `
      <div class="empty-chat">
        <p>Ask questions against the published wiki snapshot.</p>
      </div>
    `;
  }

  const messages = state.messages
    .map((message, messageIndex) => {
      const context = renderMessageContext(message);
      if (message.role === "user") {
        return `
          <div class="message user">
            ${context}
            <p>${escapeHtml(message.text)}</p>
          </div>
        `;
      }
      const references = orderReferencesForDisplay(
        displayedReferencesForAnswer(message.text, message.references || [], message),
        message.webSearchEnabled,
      );
      return `
        <div class="message assistant">
          ${context}
          <div class="message-body">${formatAnswer(message.text, references, messageIndex)}</div>
          ${renderReferences(references, messageIndex)}
        </div>
      `;
    })
    .join("");

  const pendingMessage = activeChatIsAsking()
    ? `<div class="message assistant message-pending" data-chat-pending-status>${renderChatThinking()}</div>`
    : "";

  return `${messages}${pendingMessage}`;
}

function renderMessageContext(message) {
  const label = String(message?.contextLabel || "").trim();
  if (!label) return "";
  const page = pageFromMessageContext(message);
  if (!page) {
    return `<div class="message-context" title="${escapeHtml(label)}">${escapeHtml(label)}</div>`;
  }

  return `
    <a
      class="message-context message-context-link"
      href="${page.path}"
      data-route="${escapeHtml(page.key)}"
      title="Open ${escapeHtml(page.title)}"
    >${escapeHtml(label)}</a>
  `;
}

function renderChatThinking() {
  return `
    <div class="chat-thinking" role="status" aria-live="polite" aria-label="Ask Wiki is preparing an answer">
      ${CHAT_THINKING_LABELS.map(
        (label, index) => `
          <span
            class="chat-thinking-label"
            data-thinking-label="${escapeHtml(label)}"
            style="--thinking-index: ${index};"
            aria-hidden="true"
          >
            <span class="chat-thinking-text">${escapeHtml(label)}</span>
            <span class="chat-thinking-dots" aria-hidden="true">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </span>
        `,
      ).join("")}
    </div>
  `;
}

function renderReferences(references, messageIndex) {
  if (!references.length) return "";
  return `
    <div class="references">
      ${references
        .map((ref) => {
          const isWeb = isWebReference(ref);
          const number = Number(ref.citationNumber);
          const citationLabel = Number.isFinite(number)
            ? `<span class="reference-number">[${escapeHtml(number)}]</span>`
            : "";
          const referenceId = Number.isFinite(number) ? ` id="${citationAnchorId(messageIndex, number)}"` : "";
          const title = ref.heading && ref.heading !== ref.title ? `${ref.heading} - ${ref.title}` : ref.title;
          return isWeb
            ? `
              <a${referenceId} class="reference-web" href="${escapeHtml(ref.path)}" target="_blank" rel="noreferrer" title="${escapeHtml(title)}">
                ${citationLabel || renderGlobeIcon("reference-globe")}
                <span class="reference-title">${escapeHtml(title)}</span>
              </a>
            `
            : `
              <a${referenceId} href="${ref.path}" data-route="${escapeHtml(ref.pageKey)}" title="${escapeHtml(title)}">
                ${citationLabel}
                <span class="reference-title">${escapeHtml(title)}</span>
              </a>
            `;
        })
        .join("")}
    </div>
  `;
}

function orderReferencesForDisplay(references, preferWebReferences = false) {
  if (!preferWebReferences) return references;
  return references.slice().sort((a, b) => Number(isWebReference(b)) - Number(isWebReference(a)));
}

function isWebReference(reference) {
  return reference?.kind === "web" || /^https?:\/\//.test(reference?.path || "");
}

function syncWebSearchToggle() {
  const button = document.querySelector("[data-web-search-toggle]");
  if (!button) return;
  const webSearchSupported = state.chatConfig.webSearchSupported !== false;
  button.classList.toggle("active", state.webSearch);
  button.setAttribute("aria-pressed", state.webSearch ? "true" : "false");
  button.setAttribute(
    "aria-label",
    webSearchSupported
      ? state.webSearch
        ? "Disable internet search"
        : "Allow internet search"
      : "Internet search is unavailable for this model",
  );
  button.setAttribute(
    "title",
    webSearchSupported
      ? state.webSearch
        ? "Internet search enabled"
        : "Allow internet search when needed"
      : "Internet search is unavailable for this model",
  );
}

function setChatModel(model) {
  const option = chatModelOptionsForUi().find((item) => item.model === model);
  if (!option) return;

  state.chatConfig = {
    ...state.chatConfig,
    provider: "gemini",
    model: option.model,
    modelLabel: option.label || modelLabelForConfig(option.model, "gemini"),
    webSearchSupported: true,
  };
}

function renderGlobeIcon(className) {
  return `
    <svg
      class="${className}"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M3 12h18"></path>
      <path d="M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9"></path>
      <path d="M12 3c-2.4 2.5-3.6 5.5-3.6 9s1.2 6.5 3.6 9"></path>
    </svg>
  `;
}

function renderSendIcon(className) {
  return `
    <svg
      class="${className}"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 19V5"></path>
      <path d="M5 12l7-7 7 7"></path>
    </svg>
  `;
}

function renderChatIcon(className) {
  return `
    <svg
      class="${className}"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6a8 8 0 1 1 18-5Z"></path>
    </svg>
  `;
}

function syncChatScopeState() {
  document.querySelectorAll("[data-chat-scope]").forEach((button) => {
    const isActive = button.getAttribute("data-chat-scope") === state.chatScope;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  const contextLabel = currentChatContextLabel();
  const label = document.querySelector("[data-chat-context-label]");
  if (label) {
    label.textContent = contextLabel;
    label.setAttribute("title", contextLabel);
  }
  const input = document.querySelector("[data-chat-form] textarea");
  if (input) {
    input.setAttribute(
      "placeholder",
      `Ask about ${state.chatScope === "current" ? "this page" : "this wiki"}...`,
    );
  }
}

function bindEvents() {
  document.querySelector("[data-search]")?.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    render();
    const input = document.querySelector("[data-search]");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  });

  document.querySelectorAll("[data-sidebar-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.sidebarTab = button.getAttribute("data-sidebar-tab");
      state.searchQuery = "";
      if (button.hasAttribute("data-open-nav")) {
        state.layout.sidebarCollapsed = false;
        saveLayoutState();
      }
      if (button.hasAttribute("data-open-nav") && window.matchMedia("(max-width: 820px)").matches) {
        document.body.classList.add("show-sidebar");
      }
      render();
    });
  });

  document.querySelectorAll("[data-unit-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.unitTab = button.getAttribute("data-unit-tab") || "concepts";
      render({ preserveSidebarScroll: true });
    });
  });

  document.querySelectorAll("[data-card-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".unit-card");
      const content = card?.querySelector(".unit-card-content");
      const isCollapsed = card?.classList.toggle("collapsed");
      button.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      if (content) content.hidden = Boolean(isCollapsed);
    });
  });

  document.querySelector("[data-chat-messages]")?.addEventListener("scroll", scheduleChatScrollSave, { passive: true });
  document.querySelector("[data-chat-form]")?.addEventListener("submit", askWiki);
  document.querySelector("[data-chat-form] textarea")?.addEventListener("keydown", handleChatTextareaKeydown);
  document.querySelector("[data-chat-new]")?.addEventListener("click", createNewChat);
  document.querySelector("[data-chat-close]")?.addEventListener("click", () => {
    document.body.classList.remove("show-chat");
  });
  document.querySelector("[data-chat-height-handle]")?.addEventListener("pointerdown", startMobileChatHeightDrag);
  document.querySelector("[data-chat-height-handle]")?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      adjustMobileChatHeight(5);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      adjustMobileChatHeight(-5);
    }
  });
  document.querySelector("[data-chat-history-toggle]")?.addEventListener("click", () => {
    state.chatHistoryOpen = !state.chatHistoryOpen;
    render();
  });
  document.querySelectorAll("[data-chat-thread]").forEach((button) => {
    button.addEventListener("click", () => {
      openChatThread(button.getAttribute("data-chat-thread"));
    });
  });
  document.querySelectorAll("[data-chat-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteChatThread(button.getAttribute("data-chat-delete"));
    });
  });
  document.querySelectorAll("[data-chat-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      state.chatScope = button.getAttribute("data-chat-scope") === "current" ? "current" : "wiki";
      syncChatScopeState();
    });
  });
  document.querySelector("[data-chat-model]")?.addEventListener("change", (event) => {
    setChatModel(event.target.value);
    render();
  });
  document.querySelector("[data-web-search-toggle]")?.addEventListener("click", () => {
    state.webSearch = !state.webSearch;
    syncWebSearchToggle();
  });
  document.querySelector("[data-connections-toggle]")?.addEventListener("click", () => {
    toggleConnectionsPanel();
  });
  document.querySelectorAll("[data-reader-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activateReaderTab(button.getAttribute("data-reader-tab"));
    });
  });
  document.querySelectorAll("[data-reader-tab-close]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      closeReaderTab(button.getAttribute("data-reader-tab-close"));
    });
  });
  document.querySelectorAll("[data-panel-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.getAttribute("data-panel-toggle");
      togglePanel(panel);
    });
  });
  bindPanelResizers();
  document.querySelector("[data-sidebar-toggle]")?.addEventListener("click", () => {
    document.body.classList.toggle("show-sidebar");
  });
  document.querySelector("[data-chat-toggle]")?.addEventListener("click", () => {
    document.body.classList.remove("show-sidebar");
    document.body.classList.add("show-chat");
    focusChatInput();
  });
  document.querySelector("[data-overlay-close]")?.addEventListener("click", () => {
    const hadSidebarOpen = document.body.classList.contains("show-sidebar");
    document.body.classList.remove("show-sidebar", "show-chat");
    if (hadSidebarOpen) render();
  });
}

function postProcessArticleLinks() {
  document.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    const sourceMatch = parseSourceHref(href);
    if (sourceMatch) {
      const source = findSource(sourceMatch.sourcePath);
      if (source) {
        link.setAttribute("href", sourceMatch.fragment ? `${source.url}#${sourceMatch.fragment}` : source.url);
      }
      link.removeAttribute("target");
      link.removeAttribute("rel");
      link.dataset.sourceRoute = sourceMatch.sourcePath;
      return;
    }

    const pageMatch = parsePageHref(href);
    if (pageMatch) {
      link.removeAttribute("target");
      link.dataset.route = pageMatch.pageKey;
    }
  });
}

function renderMath() {
  document.querySelectorAll(".wiki-content, .unit-panel, .message.assistant").forEach((element) => {
    renderMathInElement(element, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "$", right: "$", display: false },
      ],
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      ignoredClasses: ["mermaid"],
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
  });
}

async function renderMermaid() {
  const diagrams = [...document.querySelectorAll(".wiki-content .mermaid:not([data-mermaid-state])")];
  if (!diagrams.length) return;

  diagrams.forEach((diagram) => {
    diagram.dataset.mermaidState = "pending";
    diagram.dataset.mermaidSource = diagram.textContent || "";
  });

  try {
    const mermaid = await getMermaid();
    await mermaid.run({ nodes: diagrams });
    diagrams.forEach((diagram) => {
      preserveWideMermaidSvg(diagram);
      diagram.dataset.mermaidState = "rendered";
    });
  } catch (error) {
    diagrams.forEach((diagram) => {
      diagram.dataset.mermaidState = "error";
      diagram.textContent = diagram.dataset.mermaidSource || "";
    });
    console.error("Failed to render Mermaid diagram", error);
  }
}

function preserveWideMermaidSvg(diagram) {
  const svg = diagram.querySelector("svg");
  const viewBox = svg?.getAttribute("viewBox");
  if (!svg || !viewBox) return;

  const [, , rawWidth] = viewBox.split(/\s+/).map(Number);
  if (!Number.isFinite(rawWidth) || rawWidth <= diagram.clientWidth) return;
  svg.style.width = `${Math.ceil(rawWidth)}px`;
  svg.style.maxWidth = "none";
}

async function getMermaid() {
  if (!mermaidInstance) {
    const module = await import("mermaid");
    mermaidInstance = module.default;
    mermaidInstance.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        background: "#fbfaf5",
        primaryColor: "#edf3ff",
        primaryBorderColor: "#5673b9",
        primaryTextColor: "#2b261e",
        lineColor: "#6f6a5d",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      },
    });
  }
  return mermaidInstance;
}

function handleInternalLinkClick(event) {
  const link = event.target.closest?.("a[href]");
  if (!link || !app.contains(link)) return;

  const href = link.getAttribute("href");
  const sourceMatch = parseSourceHref(href);
  if (sourceMatch) {
    event.preventDefault();
    event.stopPropagation();
    state.chatHistoryOpen = false;
    navigateSource(sourceMatch.sourcePath, sourceMatch.fragment);
    return;
  }

  const pageMatch = parsePageHref(href);
  if (pageMatch) {
    event.preventDefault();
    event.stopPropagation();
    state.chatHistoryOpen = false;
    navigate(pageMatch.pageKey, pageMatch.hash);
  }
}

function handleDocumentClick(event) {
  if (!state.chatHistoryOpen) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("[data-chat-history-toggle], .chat-history-popover")) return;
  state.chatHistoryOpen = false;
  render();
}

function handleChatTextareaKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const form = event.currentTarget.form;
  if (!form || activeChatIsAsking() || !form.question.value.trim()) return;

  event.preventDefault();
  form.requestSubmit();
}

async function askWiki(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const question = form.question.value.trim();
  if (!question || activeChatIsAsking()) return;

  const history = chatHistoryForApi();
  const contextLabel = currentChatContextLabel();
  const contextPageKey = currentChatContextPageKey();
  const requestPageKey = state.activePageKey;
  const requestModel = state.chatConfig.model;
  const requestWebSearch = state.webSearch;
  const requestScope = state.chatScope;
  const now = new Date().toISOString();
  state.messages = [
    ...state.messages,
    {
      role: "user",
      text: question,
      contextLabel,
      contextPageKey,
      webSearchEnabled: requestWebSearch,
      createdAt: now,
    },
  ];
  const thread = syncActiveChatThread();
  const threadId = thread.id;
  state.askingThreadIds.add(threadId);
  thread.chatStickToBottom = true;
  render({ chatForceBottom: true });
  scrollChatMessagesToBottom();

  let assistantMessage;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        pageKey: requestPageKey,
        model: requestModel,
        webSearch: requestWebSearch,
        scope: requestScope,
        history,
      }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload.error || `Chat failed with ${response.status} ${response.statusText || "response"}.`);
    }
    if (!payload.answer) {
      throw new Error("Chat API returned no answer.");
    }
    if (payload.model || payload.provider) {
      state.chatConfig = {
        ...state.chatConfig,
        provider: payload.provider || state.chatConfig.provider,
        model: payload.model || state.chatConfig.model,
        modelLabel: payload.modelLabel || modelLabelForConfig(payload.model, payload.provider),
        webSearchSupported: payload.webSearchSupported ?? state.chatConfig.webSearchSupported,
        models: Array.isArray(payload.models)
          ? payload.models.filter(isChatModelOption)
          : state.chatConfig.models,
      };
    }
    assistantMessage = {
      role: "assistant",
      text: payload.answer,
      references: payload.references || [],
      contextLabel: payload.context?.scope === "current" ? payload.context.pageTitle || contextLabel : "Whole wiki",
      contextPageKey: payload.context?.scope === "current" ? payload.context.pageKey || contextPageKey : "",
      provider: payload.provider,
      model: payload.model,
      webSearchEnabled: payload.webSearch,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    assistantMessage = {
      role: "assistant",
      text: chatErrorMessage(error),
      references: [],
      contextLabel,
      contextPageKey,
      createdAt: now,
      completedAt: new Date().toISOString(),
    };
  } finally {
    const finishedInBackground = state.activeChatThreadId !== threadId;
    state.askingThreadIds.delete(threadId);
    appendMessageToChatThread(threadId, assistantMessage, { markUnread: finishedInBackground });
    if (state.activeChatThreadId === threadId || state.chatHistoryOpen) {
      render({ chatForceBottom: state.activeChatThreadId === threadId });
    }
    if (state.activeChatThreadId === threadId) {
      scrollChatMessagesToBottom();
    }
  }
}

function scrollChatMessagesToBottom() {
  requestAnimationFrame(() => {
    const messages = document.querySelector("[data-chat-messages]");
    if (!messages) return;
    messages.scrollTop = messages.scrollHeight;
    saveChatScrollPosition();
  });
}

function chatErrorMessage(error) {
  const message = error?.message || String(error);
  if (/failed to fetch/i.test(message)) {
    return [
      "Could not reach the local chat API.",
      "If the dev server just restarted, refresh the page and try again.",
      "If it keeps happening, check that the site is running on the same localhost port as this page.",
    ].join("\n");
  }
  return message;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      response.ok
        ? "Chat API returned an empty response."
        : `Chat API returned ${response.status} ${response.statusText || "an empty response"}.`,
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      response.ok
        ? "Chat API returned invalid JSON."
        : `Chat API returned ${response.status} ${response.statusText || "a non-JSON response"}.`,
    );
  }
}

function navigate(pageKey, hash = "") {
  saveActiveTabScroll();
  const page = findPage(pageKey) || state.snapshot.pages[0];
  state.activePageKey = page.key;
  state.sidebarTab = "pages";
  const nextUrl = hash ? `${page.path}#${hash}` : page.path;
  history.pushState(null, "", nextUrl);
  document.body.classList.remove("show-sidebar", "show-chat");
  render();
  scrollToReaderPosition(hash);
}

function navigateSource(sourcePath, fragment = "") {
  saveActiveTabScroll();
  const source = findSource(sourcePath);
  if (!source) return;
  state.sidebarTab = "sources";
  const nextUrl = fragment ? `${source.url}#${fragment}` : source.url;
  history.pushState(null, "", nextUrl);
  document.body.classList.remove("show-sidebar", "show-chat");
  render();
  if (!fragment) scrollToReaderPosition();
}

function restoreSidebarScroll(scrollTop) {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  sidebar.scrollTop = scrollTop;
}

function scrollToReaderPosition(hash = "") {
  requestAnimationFrame(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    const target = document.getElementById(hash);
    if (!target) return;
    const stickyOffset = document.querySelector(".publish-header")?.getBoundingClientRect().height || 0;
    const top = window.scrollY + target.getBoundingClientRect().top - stickyOffset - 18;
    window.scrollTo({ top: Math.max(0, top), left: 0, behavior: "auto" });
  });
}

function pageKeyFromLocation() {
  const slug = state.snapshot.manifest.slug;
  const path = decodeURIComponent(location.pathname);
  if (path === "/" || path === `/${slug}` || path === `/${slug}/`) return "index";
  if (path.startsWith(`/${slug}/_source/`)) return state.activePageKey || "index";
  return path.replace(`/${slug}/`, "").replace(/^\/+/, "") || "index";
}

function findPage(key) {
  if (key === READER_GUIDE_KEY) return readerGuidePage();
  return state.snapshot.pages.find((page) => page.key === key);
}

function findSource(sourcePath) {
  return state.snapshot.sources?.find((source) => source.path === sourcePath);
}

function sourceFromLocation() {
  const sourcePath = sourcePathFromLocation();
  return sourcePath ? findSource(sourcePath) : null;
}

function sourcePathFromLocation() {
  const slug = state.snapshot.manifest.slug;
  const prefix = `/${slug}/_source/`;
  if (!location.pathname.startsWith(prefix)) return "";
  return decodeURIComponent(location.pathname.slice(prefix.length));
}

function sourceFragmentFromLocation() {
  return decodeURIComponent(location.hash.replace(/^#/, ""));
}

function parseSourceHref(href) {
  const normalized = normalizeSameOriginHref(href);
  if (!normalized) return null;
  const slug = state.snapshot.manifest.slug;
  const sourcePrefix = `/${slug}/_source/`;
  const rawPrefix = "/published-sources/";

  if (normalized.pathname.startsWith(sourcePrefix)) {
    return {
      sourcePath: decodeURIComponent(normalized.pathname.slice(sourcePrefix.length)),
      fragment: decodeURIComponent(normalized.hash.replace(/^#/, "")),
    };
  }

  if (normalized.pathname.startsWith(rawPrefix)) {
    return {
      sourcePath: decodeURIComponent(normalized.pathname.slice(rawPrefix.length)),
      fragment: decodeURIComponent(normalized.hash.replace(/^#/, "")),
    };
  }

  return null;
}

function parsePageHref(href) {
  const normalized = normalizeSameOriginHref(href);
  if (!normalized) return null;
  const slug = state.snapshot.manifest.slug;
  const path = decodeURIComponent(normalized.pathname);

  if (path === `/${slug}` || path === `/${slug}/`) {
    return { pageKey: "index", hash: decodeURIComponent(normalized.hash.replace(/^#/, "")) };
  }

  const pagePrefix = `/${slug}/`;
  if (!path.startsWith(pagePrefix) || path.startsWith(`/${slug}/_source/`)) return null;
  const pageKey = path.slice(pagePrefix.length).replace(/^\/+/, "") || "index";
  if (!findPage(pageKey)) return null;

  return {
    pageKey,
    hash: decodeURIComponent(normalized.hash.replace(/^#/, "")),
  };
}

function normalizeSameOriginHref(href) {
  if (!href || href.startsWith("#")) return null;
  try {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) return null;
    return url;
  } catch {
    return null;
  }
}

function mountSourceViewer(source) {
  if (!source) return;

  if (source.type === "pdf") {
    const viewer = document.querySelector("[data-pdf-viewer]");
    if (!viewer) return;
    mountPdfViewer(source, viewer);
    return;
  }

  if (source.type === "markdown" || source.type === "text") {
    const viewer = document.querySelector("[data-source-code]");
    if (!viewer) return;
    mountSourceCodeViewer(source, viewer);
  }
}

async function mountSourceCodeViewer(source, viewer) {
  try {
    const text = await loadSourceText(source);
    if (!document.body.contains(viewer) || viewer.dataset.sourcePath !== source.path) return;
    renderSourceCode(source, viewer, text);
  } catch (error) {
    if (!document.body.contains(viewer) || viewer.dataset.sourcePath !== source.path) return;
    viewer.innerHTML = `<div class="source-code-status error">Source could not be loaded.</div>`;
    console.error(error);
  }
}

async function loadSourceText(source) {
  if (!sourceTextCache.has(source.path)) {
    sourceTextCache.set(
      source.path,
      fetch(source.rawUrl).then((response) => {
        if (!response.ok) throw new Error(`Source fetch failed: ${response.status}`);
        return response.text();
      }),
    );
  }
  return sourceTextCache.get(source.path);
}

function renderSourceCode(source, viewer, text) {
  const fragment = viewer.dataset.sourceFragment || "";
  const range = parseLineRange(fragment);
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const lineCount = lines.length;
  const activeStart = range ? clamp(range.start, 1, lineCount) : 0;
  const activeEnd = range ? clamp(range.end, activeStart, lineCount) : 0;

  viewer.innerHTML = `
    <div class="source-code-toolbar">
      <span>${escapeHtml(source.type.toUpperCase())}</span>
      <span>${lineCount} lines</span>
      ${range ? `<span>Showing L${activeStart}${activeEnd > activeStart ? `-L${activeEnd}` : ""}</span>` : ""}
    </div>
    <pre class="source-code" data-source-code-lines>${lines
      .map((line, index) => {
        const lineNumber = index + 1;
        const isHighlighted = lineNumber >= activeStart && lineNumber <= activeEnd;
        return `<span
          class="source-line ${isHighlighted ? "highlighted" : ""}"
          id="L${lineNumber}"
          data-line="${lineNumber}"
        ><a class="line-number" href="${source.url}#L${lineNumber}" data-source-route="${escapeHtml(
          source.path,
        )}">${lineNumber}</a><code>${escapeHtml(line) || " "}</code></span>`;
      })
      .join("")}</pre>
  `;

  if (activeStart) {
    requestAnimationFrame(() => {
      document.getElementById(`L${activeStart}`)?.scrollIntoView({ block: "center" });
    });
  }
}

function mountPdfViewer(source, viewer) {
  const initialPage = Number(viewer.dataset.initialPage || "1");
  const viewState = getPdfViewState(source.path, initialPage);
  viewState.page = initialPage;

  const controls = {
    count: viewer.querySelector("[data-pdf-count]"),
    input: viewer.querySelector("[data-pdf-page]"),
    next: viewer.querySelector("[data-pdf-next]"),
    pages: viewer.querySelector("[data-pdf-pages]"),
    prev: viewer.querySelector("[data-pdf-prev]"),
    stage: viewer.querySelector("[data-pdf-stage]"),
    status: viewer.querySelector("[data-pdf-status]"),
    zoomIn: viewer.querySelector("[data-pdf-zoom-in]"),
    zoomOut: viewer.querySelector("[data-pdf-zoom-out]"),
    zoomLabel: viewer.querySelector("[data-pdf-zoom-label]"),
  };

  controls.prev?.addEventListener("click", () => setPdfPage(source, controls, viewState.page - 1));
  controls.next?.addEventListener("click", () => setPdfPage(source, controls, viewState.page + 1));
  controls.input?.addEventListener("change", () => setPdfPage(source, controls, Number(controls.input.value)));
  controls.zoomIn?.addEventListener("click", () => setPdfZoom(source, controls, viewState.scale + 0.1));
  controls.zoomOut?.addEventListener("click", () => setPdfZoom(source, controls, viewState.scale - 0.1));

  if (viewState.scrollHandler) {
    controls.stage?.removeEventListener("scroll", viewState.scrollHandler);
    window.removeEventListener("scroll", viewState.scrollHandler);
  }
  viewState.scrollHandler = () => updatePdfCurrentPageFromScroll(source, controls);
  controls.stage?.addEventListener("scroll", viewState.scrollHandler);
  window.addEventListener("scroll", viewState.scrollHandler);

  renderPdf(source, controls);
}

function getPdfViewState(sourcePath, page) {
  if (!pdfViews.has(sourcePath)) {
    pdfViews.set(sourcePath, {
      page,
      scale: 1,
      pageCount: 0,
      token: null,
      observer: null,
      renderTasks: new Map(),
      renderedPages: new Set(),
      scrollFrame: null,
      scrollHandler: null,
    });
  }
  return pdfViews.get(sourcePath);
}

async function loadPdfDocument(source) {
  if (!pdfDocuments.has(source.path)) {
    pdfDocuments.set(source.path, pdfjs.getDocument(source.rawUrl).promise);
  }
  return pdfDocuments.get(source.path);
}

async function renderPdf(source, controls) {
  const viewState = getPdfViewState(source.path, 1);
  const token = Symbol(source.path);
  viewState.token = token;
  controls.status.hidden = false;
  controls.status.textContent = "Loading PDF";
  setPdfControlsDisabled(controls, true);

  try {
    const pdf = await loadPdfDocument(source);
    if (viewState.token !== token) return;

    viewState.pageCount = pdf.numPages;
    viewState.page = clamp(viewState.page, 1, pdf.numPages);
    const samplePage = await pdf.getPage(viewState.page);
    if (viewState.token !== token) return;
    const sampleViewport = getPdfViewport(samplePage, controls, viewState);
    setupPdfPages(pdf, source, controls, viewState, token, Math.floor(sampleViewport.height) + 38);
    updatePdfControls(controls, viewState);
    if (viewState.token !== token) return;
    controls.status.hidden = true;
  } catch (error) {
    if (error?.name === "RenderingCancelledException") return;
    controls.status.hidden = false;
    controls.status.textContent = "PDF could not be rendered.";
    console.error(error);
  } finally {
    if (viewState.token === token) {
      setPdfControlsDisabled(controls, false);
      updatePdfControls(controls, viewState);
    }
  }
}

function setupPdfPages(pdf, source, controls, viewState, token, pageMinHeight) {
  viewState.observer?.disconnect();
  viewState.renderTasks.forEach((task) => task?.cancel?.());
  viewState.renderTasks.clear();
  viewState.renderedPages.clear();

  controls.pages.innerHTML = Array.from({ length: pdf.numPages }, (_, index) => {
    const pageNumber = index + 1;
    return `
      <section
        class="pdf-page"
        id="page-${pageNumber}"
        data-pdf-page-number="${pageNumber}"
        style="min-height: ${pageMinHeight}px"
      >
        <canvas></canvas>
      </section>
    `;
  }).join("");

  viewState.observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const pageNumber = Number(entry.target.dataset.pdfPageNumber);
        renderPdfPage(pdf, controls, viewState, pageNumber, token);
      });
    },
    {
      root: controls.stage.scrollHeight > controls.stage.clientHeight + 2 ? controls.stage : null,
      rootMargin: "900px 0px",
      threshold: 0.01,
    },
  );

  controls.pages.querySelectorAll("[data-pdf-page-number]").forEach((pageElement) => {
    viewState.observer.observe(pageElement);
  });

  requestAnimationFrame(() => {
    scrollToPdfPage(source, controls, viewState.page, false);
  });
}

async function renderPdfPage(pdf, controls, viewState, pageNumber, token) {
  if (viewState.token !== token || viewState.renderedPages.has(pageNumber) || viewState.renderTasks.has(pageNumber)) {
    return;
  }

  const pageElement = controls.pages.querySelector(`[data-pdf-page-number="${pageNumber}"]`);
  const canvas = pageElement?.querySelector("canvas");
  if (!pageElement || !canvas) return;

  try {
    const page = await pdf.getPage(pageNumber);
    if (viewState.token !== token) return;

    const viewport = getPdfViewport(page, controls, viewState);
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const context = canvas.getContext("2d");

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    pageElement.style.minHeight = `${Math.floor(viewport.height) + 38}px`;
    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);

    const renderTask = page.render({ canvasContext: context, viewport });
    viewState.renderTasks.set(pageNumber, renderTask);
    await renderTask.promise;
    if (viewState.token !== token) return;
    viewState.renderedPages.add(pageNumber);
    pageElement.classList.add("rendered");
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") {
      pageElement?.classList.add("render-error");
      console.error(error);
    }
  } finally {
    viewState.renderTasks.delete(pageNumber);
  }
}

function getPdfViewport(page, controls, viewState) {
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(320, (controls.stage?.clientWidth || 900) - 48);
  const fitScale = clamp(availableWidth / baseViewport.width, 0.72, 1.45);
  return page.getViewport({ scale: fitScale * viewState.scale });
}

function setPdfPage(source, controls, page) {
  const viewState = getPdfViewState(source.path, 1);
  const nextPage = clamp(Number.isFinite(page) ? Math.round(page) : 1, 1, viewState.pageCount || 9999);
  if (nextPage === viewState.page && viewState.pageCount) return;
  viewState.page = nextPage;
  history.replaceState(null, "", `${source.url}#page=${nextPage}`);
  updatePdfControls(controls, viewState);
  scrollToPdfPage(source, controls, nextPage);
}

function setPdfZoom(source, controls, scale) {
  const viewState = getPdfViewState(source.path, 1);
  viewState.scale = clamp(scale, 0.7, 1.8);
  updatePdfControls(controls, viewState);
  renderPdf(source, controls);
}

function scrollToPdfPage(source, controls, page, smooth = true) {
  const viewState = getPdfViewState(source.path, 1);
  const target = controls.pages?.querySelector(`[data-pdf-page-number="${page}"]`);
  if (!target) return;

  const stageIsScrollable = controls.stage?.scrollHeight > controls.stage?.clientHeight + 2;
  if (stageIsScrollable) {
    controls.stage.scrollTo({
      top: Math.max(0, target.offsetTop - 12),
      behavior: smooth ? "smooth" : "auto",
    });
  } else {
    window.scrollTo({
      top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - 88),
      behavior: smooth ? "smooth" : "auto",
    });
  }
  history.replaceState(null, "", `${source.url}#page=${page}`);
  updatePdfControls(controls, viewState);
}

function updatePdfCurrentPageFromScroll(source, controls) {
  const viewState = getPdfViewState(source.path, 1);
  if (viewState.scrollFrame) return;

  viewState.scrollFrame = requestAnimationFrame(() => {
    viewState.scrollFrame = null;
    const pages = [...(controls.pages?.querySelectorAll("[data-pdf-page-number]") || [])];
    if (!pages.length || !controls.stage) return;

    const stageIsScrollable = controls.stage.scrollHeight > controls.stage.clientHeight + 2;
    const stageTop = controls.stage.getBoundingClientRect().top;
    const referenceY = stageIsScrollable ? stageTop + 24 : 88;
    const current = pages.reduce((best, pageElement) => {
      const rect = pageElement.getBoundingClientRect();
      const distance = Math.abs(rect.top - referenceY);
      return !best || distance < best.distance
        ? { page: Number(pageElement.dataset.pdfPageNumber), distance }
        : best;
    }, null);

    if (!current || current.page === viewState.page) return;
    viewState.page = current.page;
    history.replaceState(null, "", `${source.url}#page=${current.page}`);
    updatePdfControls(controls, viewState);
  });
}

function updatePdfControls(controls, viewState) {
  if (controls.input) {
    controls.input.value = String(viewState.page);
    controls.input.max = viewState.pageCount ? String(viewState.pageCount) : "";
  }
  if (controls.count) controls.count.textContent = viewState.pageCount ? `/ ${viewState.pageCount}` : "/ …";
  if (controls.prev) controls.prev.disabled = viewState.page <= 1;
  if (controls.next) controls.next.disabled = Boolean(viewState.pageCount && viewState.page >= viewState.pageCount);
  if (controls.zoomLabel) controls.zoomLabel.textContent = `${Math.round(viewState.scale * 100)}%`;
}

function setPdfControlsDisabled(controls, disabled) {
  [controls.input, controls.next, controls.prev, controls.zoomIn, controls.zoomOut].forEach((control) => {
    if (control) control.disabled = disabled;
  });
}

function pdfPageFromFragment(fragment) {
  const match = String(fragment || "").match(/(?:page|slide)=(\d+)/i) || String(fragment || "").match(/^(\d+)$/);
  const page = match ? Number(match[1]) : 1;
  return Number.isFinite(page) && page > 0 ? Math.round(page) : 1;
}

function parseLineRange(fragment) {
  const value = String(fragment || "");
  const match =
    value.match(/^L(\d+)(?:-L?(\d+))?$/i) ||
    value.match(/^lines?=(\d+)(?:-(\d+))?$/i);
  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1) return null;
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function searchPages(query) {
  const terms = query.split(/\s+/).filter(Boolean);
  const guide = readerGuidePage();
  const guideHaystack = `${guide.title} ${guide.text}`.toLowerCase();
  const guideScore = terms.reduce((sum, term) => sum + (guideHaystack.includes(term) ? 1 : 0), 0);
  const guideResults = guideScore > 0 ? [{ ...guide, score: guideScore }] : [];
  return [
    ...guideResults,
    ...state.snapshot.searchIndex
      .map((entry) => {
        const haystack = `${entry.title} ${entry.text}`.toLowerCase();
        const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
        return { ...findPage(entry.pageKey), score };
      })
      .filter((entry) => entry.score > 0),
  ].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

function groupPages(pages) {
  return pages.reduce((groups, page) => {
    const group = page.type || "page";
    groups[group] ||= [];
    groups[group].push(page);
    return groups;
  }, {});
}

function groupByFolder(pages, root = "") {
  return pages.reduce((groups, page) => {
    const folder = folderLabelForPage(page, root);
    groups[folder] ||= [];
    groups[folder].push(page);
    return groups;
  }, {});
}

function groupConceptPages(pages) {
  const folders = new Map();
  for (const page of pages) {
    const parts = page.key.split("/");
    const folderKey = parts[1] || "concepts";
    const subfolderKey = parts[2] || "";
    if (!folders.has(folderKey)) {
      folders.set(folderKey, {
        key: folderKey,
        label: titleCase(folderKey || "Concepts"),
        pages: [],
        directPages: [],
        subfolders: new Map(),
      });
    }
    const folder = folders.get(folderKey);
    folder.pages.push(page);
    if (!subfolderKey) {
      folder.directPages.push(page);
      continue;
    }
    if (!folder.subfolders.has(subfolderKey)) {
      folder.subfolders.set(subfolderKey, {
        key: subfolderKey,
        label: titleCase(subfolderKey),
        pages: [],
      });
    }
    folder.subfolders.get(subfolderKey).pages.push(page);
  }

  return [...folders.values()].map((folder) => ({
    ...folder,
    subfolders: [...folder.subfolders.values()],
  }));
}

function folderLabelForPage(page, root = "") {
  const parts = page.key.split("/");
  if (parts[0] === "concepts") {
    return [parts[1], parts[2]].filter(Boolean).map(titleCase).join(" / ") || "Concepts";
  }
  if (parts[0] === "summaries") {
    if (parts[1] === "textbooks" && parts[2]) return `Textbooks / ${titleCase(parts[2])}`;
    return titleCase(parts[1] || "Summaries");
  }
  return titleCase(parts.length > 2 ? parts[1] : root || parts[0] || "Pages");
}

function pageBreadcrumb(page) {
  if (page.key === READER_GUIDE_KEY) return "Start";
  if (page.key === "index") return "Start";
  const root = titleCase(page.type || "Page");
  const folder = folderLabelForPage(page);
  return folder === root ? root : `${root} / ${folder}`;
}

function sourceGroupLabel(sourcePath) {
  const parts = sourcePath.replace(/^sources\//, "").split("/");
  if (parts[0] === "textbooks" && parts[1]) return `Textbooks / ${titleCase(parts[1])}`;
  if (parts[0] === "lectures" && parts[1]) return `Lectures / ${titleCase(parts[1])}`;
  return titleCase(parts[0] || "Sources");
}

function sourceCountForPage(page) {
  const count = (page.html.match(/\/_source\//g) || []).length;
  return String(count);
}

function readingTime(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 220));
  return `${minutes} min read`;
}

function titleCase(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function folderSortKey(root, folder) {
  const orders = {
    concepts: [
      "Actuator Design",
      "Transmissions",
      "Robot Kinematics",
      "Motor Fundamentals",
      "Motor Modeling",
      "Motor Drivers",
      "Sensors",
    ],
    summaries: [
      "Lectures",
      "Textbooks / Electric Motor Control 2017",
      "Papers",
      "Application Notes",
      "Web Clippings",
      "Chatgpt Shares",
    ],
  };
  const index = orders[root]?.indexOf(folder) ?? -1;
  return `${index === -1 ? 99 : index}`.padStart(2, "0") + folder;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function formatBytes(value) {
  if (!value) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let size = Number(value);
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatAnswer(text, references = [], messageIndex = 0) {
  const webCitationNumbers = new Set(
    references
      .filter(isWebReference)
      .map((reference) => Number(reference.citationNumber))
      .filter((number) => Number.isInteger(number) && number > 0),
  );
  const normalizedText = removeUnavailableCitations(
    normalizeChatMarkdown(String(text || "").trim()),
    webCitationNumbers,
  );
  const linkedText = linkifyCitations(normalizedText, webCitationNumbers, messageIndex);
  return sanitizeHtml(chatMarkdown.render(linkedText), chatSanitizeOptions);
}

function normalizeChatMarkdown(markdown) {
  return transformMarkdownOutsideCode(markdown, (segment) =>
    linkifyWikiLinksInSegment(normalizeKoreanPostpositionEmphasis(segment)),
  );
}

function normalizeKoreanPostpositionEmphasis(segment) {
  return segment.replace(/\\?\*\\?\*([^*]+?)\\?\*\\?\*(?=[가-힣])/g, (_match, content) => {
    return `<strong>${escapeHtml(content)}</strong>`;
  });
}

function linkifyWikiLinksInSegment(segment) {
  return segment.replace(/\[\[([^\[\]\n]+?)\]\]/g, (match, rawLink) => {
    const link = parseWikiLink(rawLink);
    if (!link.target) return match;

    const resolved = resolveWikiLinkTarget(link.target);
    const label = link.label || resolved?.label || fallbackWikiLinkLabel(link.target);
    if (!resolved) return escapeMarkdownText(label);

    return `[${escapeMarkdownLinkText(label)}](${escapeMarkdownLinkHref(resolved.href)})`;
  });
}

function parseWikiLink(rawLink) {
  const [rawTarget = "", ...labelParts] = String(rawLink || "").split("|");
  return {
    target: rawTarget.trim(),
    label: labelParts.join("|").trim(),
  };
}

function resolveWikiLinkTarget(target) {
  const { targetPath, hash } = splitWikiLinkHash(target);
  const page = resolveWikiLinkPage(targetPath);
  if (page) {
    return {
      href: hash ? `${page.path}#${hash}` : page.path,
      label: page.title,
    };
  }

  const source = resolveWikiLinkSource(targetPath);
  if (source) {
    return {
      href: hash ? `${source.url}#${hash}` : source.url,
      label: source.title,
    };
  }

  return null;
}

function splitWikiLinkHash(target) {
  const normalized = String(target || "").trim();
  const hashIndex = normalized.indexOf("#");
  if (hashIndex === -1) return { targetPath: normalized, hash: "" };
  return {
    targetPath: normalized.slice(0, hashIndex).trim(),
    hash: normalized.slice(hashIndex + 1).trim(),
  };
}

function resolveWikiLinkPage(targetPath) {
  const routeMatch = parsePageHref(targetPath);
  if (routeMatch) return findPage(routeMatch.pageKey);

  const key = normalizeWikiLinkKey(targetPath);
  return findPage(key) || findPageByTitle(targetPath);
}

function resolveWikiLinkSource(targetPath) {
  const routeMatch = parseSourceHref(targetPath);
  if (routeMatch) return findSource(routeMatch.sourcePath);

  const key = normalizeWikiLinkKey(targetPath);
  const keyWithoutSourcePrefix = key.replace(/^sources\//, "");
  return state.snapshot.sources?.find((source) => {
    const sourcePath = normalizeWikiLinkKey(source.path);
    const sourceKey = normalizeWikiLinkKey(source.key || "");
    return (
      sourcePath === key ||
      sourceKey === key ||
      sourceKey === keyWithoutSourcePrefix ||
      normalizeTextKey(source.title) === normalizeTextKey(targetPath)
    );
  }) || null;
}

function normalizeWikiLinkKey(targetPath) {
  const slug = state.snapshot.manifest.slug;
  let key = decodeURIComponent(String(targetPath || "").trim())
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (key.startsWith(`${slug}/`)) key = key.slice(slug.length + 1);
  if (key.startsWith("wiki/")) key = key.slice("wiki/".length);
  if (key === slug || key === "index.md") return "index";
  return key.replace(/\.md$/i, "").replace(/^\/+/, "");
}

function findPageByTitle(title) {
  const normalized = normalizeTextKey(title);
  if (!normalized) return null;
  return state.snapshot.pages.find((page) => normalizeTextKey(page.title) === normalized) || null;
}

function normalizeTextKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function fallbackWikiLinkLabel(target) {
  const { targetPath } = splitWikiLinkHash(target);
  const key = normalizeWikiLinkKey(targetPath);
  const leaf = key.split("/").filter(Boolean).pop() || targetPath;
  return titleCase(leaf);
}

function escapeMarkdownLinkText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function escapeMarkdownLinkHref(href) {
  return encodeURI(String(href || ""))
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function escapeMarkdownText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function transformMarkdownOutsideCode(markdown, transform) {
  return String(markdown || "")
    .split(/(```[\s\S]*?```)/g)
    .map((block, index) => {
      if (index % 2 === 1) return block;
      return block
        .split(/(`[^`\n]*`)/g)
        .map((part, partIndex) => (partIndex % 2 === 1 ? part : transform(part)))
        .join("");
    })
    .join("");
}

function displayedReferencesForAnswer(text, references, message = null) {
  const webReferences = references.filter(isWebReference);
  const contextPageKey = pageFromMessageContext(message)?.key || "";
  const localReferences = references.filter(
    (reference) => !isWebReference(reference) && !isMessageContextPageReference(reference, contextPageKey),
  );
  const citationNumbers = extractCitationNumbers(text);
  const displayedLocalReferences =
    citationNumbers.size && !webReferences.length
      ? localReferences.filter((reference) => {
          const number = Number(reference.citationNumber);
          return !Number.isFinite(number) || citationNumbers.has(number);
        })
      : localReferences;
  return [...webReferences, ...displayedLocalReferences];
}

function isMessageContextPageReference(reference, contextPageKey) {
  return Boolean(contextPageKey) && reference?.pageKey === contextPageKey;
}

function removeUnavailableCitations(markdown, availableNumbers) {
  return transformMarkdownOutsideCode(markdown, (segment) => {
    const withoutUnavailableNumbers = segment.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (match, rawNumbers) => {
      const keptNumbers = rawNumbers
        .split(/\s*,\s*/)
        .map((number) => Number(number))
        .filter((number) => Number.isInteger(number) && availableNumbers.has(number));
      return keptNumbers.length ? `[${keptNumbers.join(", ")}]` : "";
    });
    return cleanRemovedCitationSpacing(
      withoutUnavailableNumbers.replace(/\[(?:global|local|wiki)\s+context\](?!\()/gi, ""),
    );
  });
}

function cleanRemovedCitationSpacing(text) {
  return String(text || "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}

function extractCitationNumbers(text) {
  const numbers = new Set();
  String(text || "").replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_match, rawNumbers) => {
    rawNumbers.split(/\s*,\s*/).forEach((number) => {
      const parsed = Number(number);
      if (Number.isInteger(parsed) && parsed > 0) numbers.add(parsed);
    });
    return "";
  });
  return numbers;
}

function linkifyCitations(markdown, citationNumbers, messageIndex) {
  if (!citationNumbers.size) return markdown;
  return markdown.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (match, rawNumbers) => {
    const numbers = rawNumbers.split(/\s*,\s*/);
    if (!numbers.some((number) => citationNumbers.has(Number(number)))) return match;
    const linkedNumbers = numbers
      .map((number) => {
        const citationNumber = Number(number);
        return citationNumbers.has(citationNumber)
          ? `[${number}](#${citationAnchorId(messageIndex, citationNumber)})`
          : number;
      })
      .join(", ");
    return `[${linkedNumbers}]`;
  });
}

function citationAnchorId(messageIndex, citationNumber) {
  return `chat-ref-${messageIndex}-${citationNumber}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
