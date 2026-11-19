/* exporter.js */

window.aiChatExporterRun = async function (request) {
  "use strict";

  const { format, filenameFormat, titlePrefix, frontmatterConfig, platform, expectedUrl } = request;
  const assertSameConversation = () => {
    if (window.location.href !== expectedUrl) {
      throw new Error("The conversation changed during export. Reopen the popup and try again.");
    }
  };
  const EXPORTER_VERSION = "3.1.0";

  // --- Hostname-Specific Selectors & Identifiers ---
  const CHATGPT = "chatgpt";
  const CHATGPT_TITLE_REPLACE_TEXT = " - ChatGPT";
  const CHATGPT_USER_MESSAGE_INDICATOR = "you said";
  const CHATGPT_POPUP_DIV_CLASS = "popover";
  const CHATGPT_BUTTON_SPECIFIC_CLASS = "text-sm";

  const GEMINI = "gemini";
  const GEMINI_TITLE_REPLACE_TEXT = "Gemini - ";
  const GEMINI_MESSAGE_ITEM_SELECTOR = "user-query, model-response";
  const GEMINI_SIDEBAR_ACTIVE_CHAT_SELECTOR = 'a[data-test-id="conversation"].selected .conversation-title';
  const GEMINI_TOPBAR_ACTIVE_CHAT_SELECTOR = "conversation-actions .conversation-title";

  const CLAUDE = "claude";
  const CLAUDE_MESSAGE_SELECTOR = ".font-claude-response:not(#markdown-artifact), [data-testid='user-message']";
  const CLAUDE_USER_MESSAGE_SELECTOR = '[data-testid="user-message"]';
  const CLAUDE_THINKING_BLOCK_CLASS = "transition-all";
  const CLAUDE_ARTIFACT_BLOCK_CELL = ".artifact-block-cell";

  const COPILOT = "copilot";
  const COPILOT_MESSAGE_SELECTOR = ".group\\/user-message, .group\\/ai-message";
  const COPILOT_USER_MESSAGE_SELECTOR = ".group\\/user-message";

  const GROK = "grok";
  const GROK_MESSAGE_SELECTOR = "div[id^='response-']";
  const GROK_CONTENT_SELECTOR = ".response-content-markdown";
  const GROK_USER_INDICATOR = ".items-end";

  // --- Markdown Formatting Constants ---
  const DEFAULT_CHAT_TITLE = "chat";
  const MARKDOWN_TOC_PLACEHOLDER_LINK = "#table-of-contents";
  const MARKDOWN_BACK_TO_TOP_LINK = `___\n###### [top](${MARKDOWN_TOC_PLACEHOLDER_LINK})\n`;
  const PARAGRAPH_FILTER_PARENT_NODES = ["TH", "TR"];

  // --- Inlined Turndown.js (v7.1.2) - BEGIN ---
  class TurndownService {
    constructor(options = {}) {
      this.rules = [];
      this.options = {
        headingStyle: "atx",
        hr: "___",
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        ...options,
      };
    }

    addRule(key, rule) {
      this.rules.push({ key, ...rule });
    }

    turndown(rootNode) {
      const process = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return Utils.escapeMd(node.nodeValue);
        if (node.nodeType !== Node.ELEMENT_NODE) return "";

        if (["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"].includes(node.nodeName)) return "";

        const rule = this.rules.find(
          (r) =>
            (typeof r.filter === "string" &&
              r.filter === node.nodeName.toLowerCase()) ||
            (Array.isArray(r.filter) &&
              r.filter.includes(node.nodeName.toLowerCase())) ||
            (typeof r.filter === "function" && r.filter(node))
        );

        const content = Array.from(node.childNodes)
          .map((n) => process(n))
          .join("");

        if (rule) return rule.replacement(content, node, this.options);
        return content;
      };

      const output = Array.from(rootNode.childNodes)
        .map((n) => process(n))
        .join("");
      return output.trim().replace(/\n{3,}/g, "\n\n");
    }
  }
  // --- Inlined Turndown.js - END ---

  // --- Utility Functions ---
  const Utils = {
    slugify(str, toLowerCase = true, maxLength = 120) {
      if (typeof str !== "string") {
        return "invalid-filename";
      }
      if (toLowerCase) {
        str = str.toLocaleLowerCase();
      }
      return str
        .replace(/[^a-zA-Z0-9\-_.+]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .replace(/^$/, "invalid-filename")
        .slice(0, maxLength);
    },

    formatLocalTime(d) {
      const pad = (n) => String(n).padStart(2, "0");
      const tzOffsetMin = -d.getTimezoneOffset();
      const sign = tzOffsetMin >= 0 ? "+" : "-";
      const absOffset = Math.abs(tzOffsetMin);
      const offsetHours = pad(Math.floor(absOffset / 60));
      const offsetMinutes = pad(absOffset % 60);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
        d.getDate()
      )}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(
        d.getSeconds()
      )}${sign}${offsetHours}${offsetMinutes}`;
    },

    truncate(str, len = 70) {
      return str.length <= len ? str : str.slice(0, len).trim() + "…";
    },

    escapeMd(text) {
      return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/[|\\`*_{}\[\]()#!~$]/g, "\\$&");
    },

    markdownLink(label, rawUrl) {
      if (!rawUrl?.trim()) return label;
      try {
        const url = new URL(rawUrl, document.baseURI);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return label;
        const href = url.href.replace(/&/g, "&amp;").replace(/[<>`\\\s]/g, encodeURIComponent);
        return `[${label}](<${href}>)`;
      } catch {
        return label;
      }
    },

    codeDelimiter(text, minimum) {
      let length = minimum;
      for (const run of text.matchAll(/`+/g)) length = Math.max(length, run[0].length + 1);
      return "`".repeat(length);
    },

    fencedCode(text, language = "") {
      const fence = Utils.codeDelimiter(text, 3);
      // Only emit ordinary syntax-highlighting hints. Viewers can run special fence types.
      const lang = /^(?:bash|c|cpp|csharp|css|csv|diff|go|html|java|javascript|js|json|jsx|kotlin|markdown|md|php|plaintext|python|py|r|ruby|rust|sh|shell|sql|swift|text|toml|ts|tsx|typescript|xml|yaml|yml|zsh)$/i.test(language)
        ? language.toLowerCase() : "";
      return `${fence}${lang}\n${text}\n${fence}`;
    },

    isValidYamlKey(key) {
      return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key);
    },

    formatYamlValue(value) {
      if (Array.isArray(value)) {
        return `[${value.map((item) => Utils.formatYamlScalar(item)).join(", ")}]`;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      return Utils.formatYamlScalar(value);
    },

    formatYamlScalar(value) {
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }

      return JSON.stringify(String(value ?? "")).replace(/[\u007f-\u009f\u2028\u2029\ufeff\ufffe\uffff]/g,
        (char) => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
    },

    replaceFrontmatterPlaceholders(value, chatData, localTime) {
      const replacements = {
        "{platform}": chatData.author,
        "{title}": chatData.title,
        "{date}": localTime,
        "{source}": chatData.threadUrl,
        "{url}": chatData.threadUrl,
        "{exporter}": EXPORTER_VERSION,
        "{count}": chatData.messageCount,
      };

      return value.replace(/\{(?:platform|title|date|source|url|exporter|count)\}/g,
        (placeholder) => String(replacements[placeholder]));
    },

    buildYamlFrontmatter(chatData, config) {
      const localTime = Utils.formatLocalTime(chatData.exportedAt);
      const builtInValues = {
        title: chatData.title,
        tags: chatData.tags,
        author: chatData.author,
        count: chatData.messageCount,
        exporter: EXPORTER_VERSION,
        date: localTime,
        url: chatData.threadUrl,
      };
      const names = new Set();
      const lines = [];

      const addField = (name, value) => {
        if (!name || !Utils.isValidYamlKey(name) || names.has(name)) return;

        names.add(name);
        const key = /^(?:null|true|false|yes|no|on|off|y|n)$/i.test(name) ? JSON.stringify(name) : name;
        lines.push(`${key}: ${Utils.formatYamlValue(value)}`);
      };

      config.fields.forEach((field) => {
        if (!Object.hasOwn(builtInValues, field.key)) return;
        addField(field.name, builtInValues[field.key]);
      });

      config.customFields.forEach((field) => {
        const value = Utils.replaceFrontmatterPlaceholders(field.value, chatData, localTime);
        addField(field.name, value);
      });

      return `---\n${lines.join("\n")}\n---\n`;
    },

    downloadFile(filename, text, mimeType = "text/plain;charset=utf-8") {
      const blob = new Blob([text], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },

    formatFileName(format, title, tags, ext) {
      const tagsArray = Array.isArray(tags) ? tags : [];

      const replacements = {
        "{exporter}": EXPORTER_VERSION,
        "{platform}": platform,
        "{title}": title.slice(0, 70).toLocaleLowerCase(),
        "{timestamp}": new Date().toISOString(),
        "{timestampLocal}": Utils.formatLocalTime(new Date()),
        "{tags}": tagsArray.join("-").toLocaleLowerCase(),
      };

      for (let i = 0; i < 9; i++) {
        const tagName = `{tag${i + 1}}`;
        replacements[tagName] = tagsArray[i]
          ? tagsArray[i].toLocaleLowerCase()
          : "";
      }

      const formattedFilename = format.replace(/\{(?:exporter|platform|title|timestampLocal|timestamp|tags|tag[1-9])\}/g,
        (placeholder) => replacements[placeholder]);
      const stem = Utils.slugify(formattedFilename.replace(/(_+|-+)$/, ""), false, 120 - ext.length - 1)
        .replace(/^\.+|\.+$/g, "") || DEFAULT_CHAT_TITLE;
      const safeStem = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)
        ? "_" + stem.slice(0, 118 - ext.length) : stem;
      return `${safeStem}.${ext}`;
    },

    parseChatTitleAndTags(rawTitle) {
      const tags = [];
      let cleanedTitle = rawTitle.trim();

      const tagRegex = /(^|\s)#(\S+)/g;
      let match;

      while ((match = tagRegex.exec(cleanedTitle)) !== null) {
        const tagName = match[2];
        if (!/^\d+$/.test(tagName)) {
          tags.push(tagName);
        }
      }

      cleanedTitle = cleanedTitle.replace(/(^|\s)#\S+/g, " ").trim();
      cleanedTitle = cleanedTitle.replace(/\s+/g, " ").trim();

      return {
        title: cleanedTitle,
        tags: tags,
      };
    },

    getCleanUrl() {
      return window.location.origin + window.location.pathname;
    },

    findScrollContainer(doc) {
      const main = doc.querySelector("main");
      if (main) {
        if (main.scrollHeight > main.clientHeight && window.getComputedStyle(main).overflowY.match(/(auto|scroll)/)) {
          return main;
        }
        const candidates = main.querySelectorAll("div[class*='overflow'], div[style*='overflow'], div");
        for (const el of candidates) {
          const style = window.getComputedStyle(el);
          if (el.scrollHeight > el.clientHeight + 40 && style.overflowY.match(/(auto|scroll)/)) {
            return el;
          }
        }
      }
      const allCandidates = doc.querySelectorAll("div[class*='overflow-y-auto'], div[class*='overflow-auto']");
      for (const el of allCandidates) {
        if (el.scrollHeight > el.clientHeight + 40) return el;
      }
      return doc.scrollingElement || doc.documentElement || doc.body;
    },
  };

  // --- Core Export Logic ---
  const snapshotDocument = document.implementation.createHTMLDocument("");
  const ChatExporter = {
    async extractChatGPTChatData(doc) {
      const turnsMap = new Map();

      function getTopLevelTurnElements() {
        const root = doc.querySelector("main") || doc;
        for (const selector of ["[data-testid^='conversation-turn-']", "[data-chatgpt-search-unit-key]",
          "article[data-turn], article:has([data-message-author-role])",
          "[data-message-author-role='user'], [data-message-author-role='assistant']"]) {
          const turns = root.querySelectorAll(selector);
          if (turns.length) {
            return [...turns].filter((turn) => !turn.parentElement?.closest(selector));
          }
        }
        return [];
      }

      function scrapeCurrentView() {
        assertSameConversation();
        const turnElements = getTopLevelTurnElements();
        turnElements.forEach((turnEl) => {
          const testId = turnEl.getAttribute("data-testid") || "";
          const turnIndexMatch = testId.match(/conversation-turn-(\d+)/);
          const unitKey = turnEl.getAttribute("data-chatgpt-search-unit-key") || "";
          const unitIndexMatch = unitKey.match(/(?:^|-)turn-(\d+):(\d+):(user|assistant)$/);
          const turnIndex = turnIndexMatch
            ? parseInt(turnIndexMatch[1], 10)
            : unitIndexMatch
              ? parseInt(unitIndexMatch[1], 10) * 1000 + parseInt(unitIndexMatch[2], 10)
              : null;

          const userMessageEl = turnEl.matches("[data-message-author-role='user']")
            ? turnEl : turnEl.querySelector("[data-message-author-role='user']");
          const assistantMessageEl = turnEl.matches("[data-message-author-role='assistant']")
            ? turnEl : turnEl.querySelector("[data-message-author-role='assistant']");
          const turnType = turnEl.getAttribute("data-turn");
          const header = turnEl.querySelector("h4, h5, h6")?.textContent?.trim() || "";

          // Case A: Turn contains BOTH user and assistant elements
          if (userMessageEl && assistantMessageEl) {
            const uText = userMessageEl.innerText.trim();
            if (uText) {
              const uIndex = turnIndex !== null ? turnIndex * 2 : null;
              const uKey = uIndex !== null ? `turn-${uIndex}-user` : `user-${uText.slice(0, 80)}`;
              if (!turnsMap.has(uKey)) {
                turnsMap.set(uKey, {
                  order: uIndex !== null ? uIndex : 999999,
                  author: "user",
                  contentHtml: snapshotDocument.importNode(userMessageEl, true),
                  contentText: uText,
                });
              }
            }
            const aTarget = assistantMessageEl.querySelector(".markdown") || assistantMessageEl;
            const aText = aTarget.innerText.trim();
            if (aText) {
              const aIndex = turnIndex !== null ? turnIndex * 2 + 1 : null;
              const aKey = aIndex !== null ? `turn-${aIndex}-ai` : `ai-${aText.slice(0, 80)}`;
              if (!turnsMap.has(aKey)) {
                turnsMap.set(aKey, {
                  order: aIndex !== null ? aIndex : 999999,
                  author: "ai",
                  contentHtml: snapshotDocument.importNode(aTarget, true),
                  contentText: aText,
                });
              }
            }
            return;
          }

          // Case B: Turn is a single user or assistant message
          const isUser = Boolean(
            userMessageEl ||
            unitIndexMatch?.[3] === "user" ||
            turnType === "user" ||
            header.toLowerCase().includes(CHATGPT_USER_MESSAGE_INDICATOR) ||
            (!assistantMessageEl && turnEl.querySelector(".whitespace-pre-wrap") && !turnEl.querySelector(".markdown"))
          );
          const author = isUser ? "user" : "ai";

          let contentTarget = null;
          if (isUser) {
            contentTarget = userMessageEl?.querySelector("[data-user-message-bubble], .whitespace-pre-wrap, .text-message")
              || turnEl.querySelector("[data-user-message-bubble], .whitespace-pre-wrap, .text-message")
              || userMessageEl || turnEl;
          } else {
            contentTarget = assistantMessageEl?.querySelector("[data-markdown-text-style='assistant-message'], .markdown")
              || turnEl.querySelector("[data-markdown-text-style='assistant-message'], .markdown, [data-message-author-role='assistant']")
              || assistantMessageEl || turnEl;
          }

          const contentText = (contentTarget.innerText || contentTarget.textContent || "").trim();
          if (!contentText) return;

          const dedupeKey = unitKey || (turnIndex !== null ? `turn-${turnIndex}` : `${author}-${contentText.slice(0, 80)}`);
          if (!turnsMap.has(dedupeKey)) {
            turnsMap.set(dedupeKey, {
              order: turnIndex !== null ? turnIndex : 999999,
              author,
              contentHtml: snapshotDocument.importNode(contentTarget, true),
              contentText,
            });
          }
        });
      }

      // 1. Initial scrape of currently visible turns
      scrapeCurrentView();

      // 2. Find scroll container to traverse virtualized list
      const container = Utils.findScrollContainer(doc);
      if (container) {
        const isWindow = (container === doc.documentElement || container === doc.body);
        const getScrollHeight = () => (isWindow ? document.documentElement.scrollHeight : container.scrollHeight);
        const getClientHeight = () => (isWindow ? window.innerHeight : container.clientHeight);
        const getScrollTop = () => (isWindow ? window.scrollY : container.scrollTop);
        const setScroll = (pos) => {
          if (isWindow) window.scrollTo({ top: pos, behavior: "instant" });
          else container.scrollTop = pos;
        };

        const initialScrollTop = getScrollTop();

        if (getScrollHeight() > getClientHeight() + 50) {
          const reverseScroll = !isWindow && window.getComputedStyle(container).flexDirection === "column-reverse";
          const topPosition = () => reverseScroll ? getClientHeight() - getScrollHeight() : 0;
          const bottomPosition = () => reverseScroll ? 0 : getScrollHeight() - getClientHeight();
          // Scroll to top
          setScroll(topPosition());
          await new Promise((r) => setTimeout(r, 180));
          scrapeCurrentView();

          // Scroll through in increments to trigger rendering of all virtualized DOM batches
          const step = Math.max(250, Math.floor(getClientHeight() * 0.65));
          let currentPos = topPosition();
          let iterations = 0;
          const maxIterations = 100;

          while (currentPos < bottomPosition() && iterations < maxIterations) {
            currentPos = Math.min(currentPos + step, bottomPosition());
            setScroll(currentPos);
            await new Promise((r) => setTimeout(r, 100));
            scrapeCurrentView();
            iterations++;
          }

          // Scroll to bottom for final turns
          setScroll(bottomPosition());
          await new Promise((r) => setTimeout(r, 180));
          scrapeCurrentView();

          // Restore initial scroll position
          setScroll(initialScrollTop);
        }
      }

      const rawTurns = Array.from(turnsMap.values());
      if (rawTurns.length === 0) return null;

      // Sort turns strictly by order index
      rawTurns.sort((a, b) => a.order - b.order);

      let title = doc.title.replace(CHATGPT_TITLE_REPLACE_TEXT, "").trim() || DEFAULT_CHAT_TITLE;
      const messages = [];
      let chatIndex = 1;

      for (const turn of rawTurns) {
        const messageId = `${turn.author}-${chatIndex}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        messages.push({
          id: messageId,
          author: turn.author,
          contentHtml: turn.contentHtml,
          contentText: turn.contentText,
          timestamp: new Date(),
          originalIndex: chatIndex,
        });

        if (turn.author === "ai") chatIndex++;
      }

      const _parsedTitle = Utils.parseChatTitleAndTags(title);

      return {
        _raw_title: title,
        title: _parsedTitle.title,
        tags: _parsedTitle.tags,
        author: platform,
        messages: messages,
        messageCount: messages.filter((m) => m.author === "user").length,
        exportedAt: new Date(),
        exporterVersion: EXPORTER_VERSION,
        threadUrl: Utils.getCleanUrl(),
      };
    },

    async extractClaudeChatData(doc) {
      const messageItems = [...doc.querySelectorAll(CLAUDE_MESSAGE_SELECTOR)];
      if (messageItems.length === 0) return null;

      const messages = [];
      let chatIndex = 1;
      let rawTitle = doc.title || DEFAULT_CHAT_TITLE;
      const chatTitle = rawTitle.replace(/\s-\sClaude$/, "").trim();

      messageItems.forEach((item) => {
        const isUser = item.matches(CLAUDE_USER_MESSAGE_SELECTOR);
        const author = isUser ? "user" : "ai";

        let messageContentHtml = null;
        let messageContentText = "";

        if (isUser) {
          messageContentHtml = item;
          messageContentText = item.innerText.trim();
        } else {
          const claudeResponseContent = snapshotDocument.createElement("div");
          Array.from(item.children).forEach((child) => {
            const isThinkingBlock = child.classList.contains(
              CLAUDE_THINKING_BLOCK_CLASS
            );
            const isArtifactBlock =
              (child.classList.contains("pt-3") &&
                child.classList.contains("pb-3")) ||
              child.querySelector(CLAUDE_ARTIFACT_BLOCK_CELL);

            if (!isThinkingBlock && !isArtifactBlock) {
              const contentGrid = child.querySelector(".grid-cols-1");
              if (contentGrid) {
                claudeResponseContent.appendChild(snapshotDocument.importNode(contentGrid, true));
              }
            }
          });
          messageContentHtml = claudeResponseContent;
          messageContentText = claudeResponseContent.innerText.trim();
        }

        if (messageContentText) {
          const messageId = `${author}-${chatIndex}-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)}`;

          messages.push({
            id: messageId,
            author: author,
            contentHtml: messageContentHtml,
            contentText: messageContentText,
            timestamp: new Date(),
            originalIndex: chatIndex,
          });

          if (!isUser) chatIndex++;
        }
      });

      const _parsedTitle = Utils.parseChatTitleAndTags(chatTitle);

      return {
        _raw_title: chatTitle,
        title: _parsedTitle.title,
        tags: _parsedTitle.tags,
        author: platform,
        messages: messages,
        messageCount: messages.filter((m) => m.author === "user").length,
        exportedAt: new Date(),
        exporterVersion: EXPORTER_VERSION,
        threadUrl: Utils.getCleanUrl(),
      };
    },

    async extractCopilotChatData(doc) {
      const messageItems = [...doc.querySelectorAll(COPILOT_MESSAGE_SELECTOR)];
      if (messageItems.length === 0) return null;

      const messages = [];
      let chatIndex = 1;

      let rawTitle = "";
      const selected = doc.querySelector(
        '[role="option"][aria-selected="true"]'
      );
      if (selected) {
        rawTitle =
          selected.querySelector("p")?.textContent.trim() ||
          (selected.getAttribute("aria-label") || "")
            .split(",")
            .slice(1)
            .join(",")
            .trim();
      }
      if (!rawTitle) {
        rawTitle = (doc.title || "")
          .replace(/^\s*Microsoft[_\s-]*Copilot.*$/i, "")
          .replace(/\s*[-–|]\s*Copilot.*$/i, "")
          .trim();
      }
      if (!rawTitle) rawTitle = "Copilot Conversation";

      for (const item of messageItems) {
        const isUser = item.matches(COPILOT_USER_MESSAGE_SELECTOR);
        const author = isUser ? "user" : "ai";

        const messageContentElem = isUser
          ? item.querySelector('[data-content="user-message"]')
          : item.querySelector(".group\\/ai-message-item");

        if (!messageContentElem) continue;

        const messageId = `${author}-${chatIndex}-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)}`;

        messages.push({
          id: messageId,
          author: author,
          contentHtml: messageContentElem,
          contentText: messageContentElem.innerText.trim(),
          timestamp: new Date(),
          originalIndex: chatIndex,
        });

        if (author === "ai") chatIndex++;
      }

      const _parsedTitle = Utils.parseChatTitleAndTags(rawTitle);

      return {
        _raw_title: rawTitle,
        title: _parsedTitle.title,
        tags: _parsedTitle.tags,
        author: COPILOT,
        messages: messages,
        messageCount: messages.filter((m) => m.author === "user").length,
        exportedAt: new Date(),
        exporterVersion: EXPORTER_VERSION,
        threadUrl: Utils.getCleanUrl(),
      };
    },

    async extractGeminiChatData(doc) {
      const scroller = doc.querySelector(".conversation-container, infinite-scroller, [data-test-id='virtuoso-scroller'], main") || Utils.findScrollContainer(doc);
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 50) {
        let lastCount = doc.querySelectorAll(GEMINI_MESSAGE_ITEM_SELECTOR).length;
        let retries = 0;
        for (let i = 0; i < 20; i++) {
          scroller.scrollTop = 0;
          await new Promise((r) => setTimeout(r, 180));
          assertSameConversation();
          const newCount = doc.querySelectorAll(GEMINI_MESSAGE_ITEM_SELECTOR).length;
          if (newCount === lastCount) {
            retries++;
            if (retries >= 2) break;
          } else {
            lastCount = newCount;
            retries = 0;
          }
        }
      }

      const messageItems = [
        ...doc.querySelectorAll(GEMINI_MESSAGE_ITEM_SELECTOR),
      ];
      if (messageItems.length === 0) return null;

      let title = DEFAULT_CHAT_TITLE;

      const sidebarActiveChatItem = doc.querySelector(
        GEMINI_SIDEBAR_ACTIVE_CHAT_SELECTOR
      );
      const topbarActiveChatItem = doc.querySelector(
        GEMINI_TOPBAR_ACTIVE_CHAT_SELECTOR
      );

      if (sidebarActiveChatItem && sidebarActiveChatItem.textContent.trim()) {
        title = sidebarActiveChatItem.textContent.trim();
      } else if (
        topbarActiveChatItem &&
        topbarActiveChatItem.textContent.trim()
      ) {
        title = topbarActiveChatItem.textContent.trim();
      } else {
        title = doc.title;
      }

      if (title.startsWith(GEMINI_TITLE_REPLACE_TEXT)) {
        title = title.replace(GEMINI_TITLE_REPLACE_TEXT, "").trim();
      }

      const configuredPrefix = titlePrefix;

      if (configuredPrefix && title.startsWith(configuredPrefix.trim())) {
        const Glen = configuredPrefix.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const prefixRegex = new RegExp(`^${Glen}\\s*`);
        title = title.replace(prefixRegex, "").trim();
      }

      const messages = [];
      let chatIndex = 1;

      for (const item of messageItems) {
        let author = "";
        let messageContentElem = null;

        const tagName = item.tagName.toLowerCase();

        if (tagName === "user-query") {
          author = "user";
          messageContentElem = item.querySelector("div.query-content");
        } else if (tagName === "model-response") {
          author = "ai";
          messageContentElem = item.querySelector("message-content");
        }

        if (!messageContentElem) continue;

        const messageId = `${author}-${chatIndex}-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)}`;

        messages.push({
          id: messageId,
          author: author,
          contentHtml: messageContentElem,
          contentText: messageContentElem.innerText
            .replace(/^you said\s+/i, "")
            .trim(),
          timestamp: new Date(),
          originalIndex: chatIndex,
        });

        if (author === "ai") chatIndex++;
      }

      if (
        title === DEFAULT_CHAT_TITLE &&
        messages.length > 0 &&
        messages[0].author === "user"
      ) {
        const firstUserMessage = messages[0].contentText;
        const words = firstUserMessage
          .split(/\s+/)
          .filter((word) => word.length > 0);
        if (words.length > 0) {
          let generatedTitle = words.slice(0, 7).join(" ");
          generatedTitle = generatedTitle.replace(/[,.;:!?\-+]$/, "").trim();
          if (generatedTitle.length < 5 && words.length > 1) {
            generatedTitle = words
              .slice(0, Math.min(words.length, 10))
              .join(" ");
            generatedTitle = generatedTitle.replace(/[,.;:!?\-+]$/, "").trim();
          }
          title = generatedTitle || DEFAULT_CHAT_TITLE;
        }
      }

      const _parsedTitle = Utils.parseChatTitleAndTags(title);

      return {
        _raw_title: title,
        title: _parsedTitle.title,
        tags: _parsedTitle.tags,
        author: platform,
        messages: messages,
        messageCount: messages.filter((m) => m.author === "user").length,
        exportedAt: new Date(),
        exporterVersion: EXPORTER_VERSION,
        threadUrl: Utils.getCleanUrl(),
      };
    },

    async extractGrokChatData(doc) {
      const messageItems = [...doc.querySelectorAll(GROK_MESSAGE_SELECTOR)];
      if (messageItems.length === 0) return null;

      const messages = [];
      let chatIndex = 1;
      let rawTitle = doc.title || DEFAULT_CHAT_TITLE;
      const chatTitle = rawTitle.replace(/\s-\sGrok$/, "").trim();

      for (const item of messageItems) {
        const isUser = item.matches(GROK_USER_INDICATOR);
        const author = isUser ? "user" : "ai";
        const messageContentElem = item.querySelector(GROK_CONTENT_SELECTOR);

        if (!messageContentElem) continue;

        const textSourceElem = isUser
          ? messageContentElem
          : item.querySelector(".response-content-markdown") ||
            messageContentElem;

        const messageId = `${author}-${chatIndex}-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)}`;

        messages.push({
          id: messageId,
          author: author,
          contentHtml: messageContentElem,
          contentText: textSourceElem.innerText.trim(),
          timestamp: new Date(),
          originalIndex: chatIndex,
        });

        if (author === "ai") chatIndex++;
      }

      const _parsedTitle = Utils.parseChatTitleAndTags(chatTitle);

      return {
        _raw_title: chatTitle,
        title: _parsedTitle.title,
        tags: _parsedTitle.tags,
        author: GROK,
        messages: messages,
        messageCount: messages.filter((m) => m.author === "user").length,
        exportedAt: new Date(),
        exporterVersion: EXPORTER_VERSION,
        threadUrl: Utils.getCleanUrl(),
      };
    },

    formatToMarkdown(chatData, turndownServiceInstance) {
      let toc = "";
      let content = "";
      let exportChatIndex = 0;

      chatData.messages.forEach((msg) => {
        if (msg.author === "user") {
          exportChatIndex++;
          const preview = Utils.truncate(
            msg.contentText.replace(/\s+/g, " "),
            70
          );
          toc += `- [${exportChatIndex}: ${Utils.escapeMd(
            preview
          )}](#chat-${exportChatIndex})\n`;
          content +=
            `## chat-${exportChatIndex}\n\n> ` +
            Utils.escapeMd(msg.contentText).replace(/\r\n?|\n/g, "\n> ") +
            "\n\n";
        } else {
          let markdownContent;
          try {
            markdownContent = turndownServiceInstance.turndown(msg.contentHtml);
          } catch (e) {
            console.error(
              `Error converting AI message ${msg.id} to Markdown:`,
              e
            );
            markdownContent = "Conversion error. Original text follows.\n\n" + Utils.fencedCode(msg.contentText);
          }
          content += markdownContent + "\n\n" + MARKDOWN_BACK_TO_TOP_LINK;
        }
      });

      const yaml = Utils.buildYamlFrontmatter(chatData, frontmatterConfig);
      const tocBlock = `## Table of Contents\n\n${toc.trim()}\n\n`;

      const finalOutput =
        yaml + `\n# ${Utils.escapeMd(chatData.title)}\n\n` + tocBlock + content.trim() + "\n\n";

      const fileName = Utils.formatFileName(
        filenameFormat,
        chatData.title,
        chatData.tags,
        "md"
      );
      return { output: finalOutput, fileName: fileName };
    },

    formatToJSON(chatData, turndownServiceInstance) {
      const processMessageContent = function (msg) {
        if (msg.author === "user") {
          return msg.contentText;
        } else {
          let markdownContent;
          try {
            markdownContent = turndownServiceInstance.turndown(msg.contentHtml);
          } catch (e) {
            console.error(
              `Error converting AI message ${msg.id} to Markdown:`,
              e
            );
            markdownContent = `[CONVERSION ERROR: Failed to render this section.]: ${Utils.escapeMd(msg.contentText)}`;
          }
          return markdownContent;
        }
      };
      const jsonOutput = {
        title: chatData.title,
        tags: chatData.tags,
        author: chatData.author,
        count: chatData.messageCount,
        exporter: EXPORTER_VERSION,
        date: chatData.exportedAt.toISOString(),
        url: chatData.threadUrl,
        messages: chatData.messages.map((msg) => ({
          id: msg.id.split("-").slice(0, 2).join("-"),
          author: msg.author,
          content: processMessageContent(msg),
        })),
      };

      const fileName = Utils.formatFileName(
        filenameFormat,
        chatData.title,
        chatData.tags,
        "json"
      );

      return {
        output: JSON.stringify(jsonOutput, null, 2),
        fileName: fileName,
      };
    },

    setupTurndownRules(turndownServiceInstance) {
      if (platform === CHATGPT) {
        turndownServiceInstance.addRule("chatgptRemoveReactions", {
          filter: (node) =>
            node.nodeName === "DIV" &&
            node.querySelector(
              ':scope > div:nth-child(1) > button[data-testid="copy-turn-action-button"]'
            ),
          replacement: () => "",
        });
        turndownServiceInstance.addRule("chatgptRemoveH6ChatGPTSaid", {
          filter: (node) =>
            node.nodeName === "H6" &&
            node.classList.contains("sr-only") &&
            node.textContent.trim().toLowerCase().startsWith("chatgpt said"),
          replacement: () => "",
        });
      }

      if (platform === COPILOT) {
        turndownServiceInstance.addRule("copilotRemoveReactions", {
          filter: (node) =>
            node.matches('[data-testid="message-item-reactions"]'),
          replacement: () => "",
        });

        turndownServiceInstance.addRule("copilotCodeBlock", {
          filter: function (node) {
            return (
              node.nodeName === "DIV" &&
              node.querySelector(":scope > div:nth-child(1) span") &&
              node.querySelector(":scope > div:nth-child(2) > div > pre")
            );
          },
          replacement: function (content, node) {
            const languageNode = node.querySelector(
              ":scope > div:nth-child(1) span"
            );
            const language = languageNode
              ? languageNode.textContent.trim().toLowerCase()
              : "";

            const codeNode = node.querySelector(
              ":scope > div:nth-child(2) > div > pre > code"
            );
            if (!codeNode) return "";

            const codeText = codeNode.textContent || "";

            return "\n\n" + Utils.fencedCode(codeText, language) + "\n\n";
          },
        });

        turndownServiceInstance.addRule("copilotFooterLinks", {
          filter: function (node) {
            return (
              node.nodeName === "A" &&
              node.querySelector(":scope > span:nth-child(1)") &&
              node.querySelector(":scope > img:nth-child(2)") &&
              node.querySelector(":scope > span:nth-child(3)")
            );
          },
          replacement: function (content, node) {
            const lastSpan = node.querySelector(":scope > span:nth-child(3)");
            const linkText = lastSpan
              ? lastSpan.textContent.trim()
              : node.getAttribute("href");

            return Utils.markdownLink(Utils.escapeMd(linkText || ""), node.getAttribute("href")) + " ";
          },
        });
      }

      turndownServiceInstance.addRule("lineBreak", {
        filter: "br",
        replacement: () => "  \n",
      });

      turndownServiceInstance.addRule("heading", {
        filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
        replacement: (content, node) => {
          const hLevel = Number(node.nodeName.charAt(1));
          return `\n\n${"#".repeat(hLevel)} ${content}\n\n`;
        },
      });

      turndownServiceInstance.addRule("customLi", {
        filter: "li",
        replacement: function (content, node) {
          let processedContent = content.trim();

          if (processedContent.length > 0) {
            const lines = processedContent.split("\n");
            if (lines.length > 1 && /^\s*[-*+]|^[0-9]+\./.test(lines[1])) {
              processedContent = lines.join("\n\n").trim();
            }
          }

          let listItemMarkdown;
          if (node.parentNode.nodeName === "UL") {
            let indent = "";
            let liAncestorCount = 0;
            let parent = node.parentNode;

            while (parent) {
              if (parent.nodeName === "LI") {
                liAncestorCount++;
              }
              parent = parent.parentNode;
            }
            for (let i = 0; i < liAncestorCount; i++) {
              indent += "    ";
            }
            listItemMarkdown = `${indent}${turndownServiceInstance.options.bulletListMarker} ${processedContent}`;
          } else if (node.parentNode.nodeName === "OL") {
            const siblings = Array.from(node.parentNode.children).filter(
              (child) => child.nodeName === "LI"
            );
            const index = siblings.indexOf(node);
            listItemMarkdown = `${index + 1}. ${processedContent}`;
          } else {
            listItemMarkdown = processedContent;
          }
          return listItemMarkdown + "\n";
        }.bind(turndownServiceInstance),
      });

      if (platform === CLAUDE) {
        turndownServiceInstance.addRule("claudeCodeBlock", {
          filter: function (node) {
            return (
              node.nodeName === "DIV" &&
              node.querySelector(":scope > div:nth-child(2)") &&
              node.querySelector(":scope > div:nth-child(3) > pre > code")
            );
          },
          replacement: function (content, node) {
            const languageNode = node.querySelector(
              ":scope > div:nth-child(2)"
            );
            const language = languageNode
              ? languageNode.textContent.trim().toLowerCase()
              : "";

            const codeNode = node.querySelector(
              ":scope > div:nth-child(3) > pre > code"
            );
            if (!codeNode) return "";

            const codeText = codeNode.textContent || "";

            return "\n\n" + Utils.fencedCode(codeText, language) + "\n\n";
          },
        });
      }

      if (platform === GROK) {
        turndownServiceInstance.addRule("grokPreserveNewlines", {
          filter: (node) => {
            return (
              node.nodeName === "P" &&
              node.getAttribute("style")?.includes("white-space: pre-wrap")
            );
          },
          replacement: (content) => {
            const preservedContent = content.trim().replace(/\n/g, "\n\n");
            return `\n\n${preservedContent}\n\n`;
          },
        });

        turndownServiceInstance.addRule("grokCodeBlock", {
          filter: function (node) {
            return (
              node.nodeName === "DIV" &&
              node.getAttribute("data-testid") === "code-block"
            );
          },
          replacement: function (content, node) {
            const langSpan = node.querySelector(".font-mono.text-xs");
            const rawLang = langSpan
              ? langSpan.textContent.trim().toLowerCase()
              : "";
            const lang = rawLang === "text" ? "" : rawLang;

            const source = node.querySelector("pre code, pre");
            if (source) return "\n\n" + Utils.fencedCode(source.textContent, lang) + "\n\n";

            let codeText = node.textContent;
            if (langSpan) {
              const langLabel = langSpan.textContent.trim();
              if (codeText.startsWith(langLabel)) {
                codeText = codeText.slice(langLabel.length);
              }
            }
            codeText = codeText.replace(/^(Collapse|Run|Copy|Wrap)+/, "");
            codeText = codeText.trim();

            if (!codeText) return "";
            return "\n\n" + Utils.fencedCode(codeText, lang) + "\n\n";
          },
        });
      }

      turndownServiceInstance.addRule("code", {
        filter: "code",
        replacement: (content, node) => {
          if (node.parentNode.nodeName === "PRE") return content;

          if (platform === GROK) {
            if (node.closest && node.closest('[data-testid="code-block"]')) {
              return content;
            }
          }

          const text = node.textContent.replace(/[\r\n]+/g, " ");
          const fence = Utils.codeDelimiter(text, 1);
          return `${fence} ${text} ${fence}`;
        },
      });

      turndownServiceInstance.addRule("pre", {
        filter: "pre",
        replacement: (content, node) => {
          let lang = "";
          let codeText = "";

          if (platform === GEMINI) {
            const geminiCodeBlockParent = node.closest(".code-block");
            if (geminiCodeBlockParent) {
              const geminiLanguageSpan = geminiCodeBlockParent.querySelector(
                ".code-block-decoration span"
              );
              if (geminiLanguageSpan && geminiLanguageSpan.textContent.trim()) {
                lang = geminiLanguageSpan.textContent.trim();
              }
            }
          }

          if (platform === CHATGPT) {
            const chatgptLanguageDiv = node.querySelector(
              ".text-token-text-primary, .flex.items-center.text-token-text-secondary, .text-xs.font-sans"
            );
            if (chatgptLanguageDiv) {
              const firstSpan = chatgptLanguageDiv.querySelector("span");
              lang = firstSpan
                ? firstSpan.textContent.trim()
                : chatgptLanguageDiv.textContent
                    .replace(/Copy code|Run/gi, "")
                    .trim();
            }

            const cmContent = node.querySelector(".cm-content");
            if (cmContent) {
              codeText = cmContent.innerText;
            }
          }

          const codeElement = node.querySelector("code");

          if (!codeText && codeElement) {
            codeText = codeElement.textContent;
          }

          if (!codeText && !codeElement) codeText = node.textContent;

          if (!lang && codeElement && codeElement.className) {
            const match = codeElement.className.match(/language-(\w+)/);
            if (match) lang = match[1];
          }

          const cleanCode = (codeText || "").trim();

          let prefix = "\n";
          let prevSibling = node.previousElementSibling;
          if (prevSibling && prevSibling.nodeName === "P") {
            let parentLi = prevSibling.closest("li");
            if (parentLi && parentLi.contains(node)) {
              prefix = "\n\n";
            }
          }

          return prefix + Utils.fencedCode(cleanCode, lang) + "\n";
        },
      });

      turndownServiceInstance.addRule("strong", {
        filter: ["strong", "b"],
        replacement: (content) => `**${content}**`,
      });

      turndownServiceInstance.addRule("em", {
        filter: ["em", "i"],
        replacement: (content) => `_${content}_`,
      });

      turndownServiceInstance.addRule("blockQuote", {
        filter: "blockquote",
        replacement: (content) =>
          content
            .trim()
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n"),
      });

      turndownServiceInstance.addRule("link", {
        filter: "a",
        replacement: (content, node) =>
          Utils.markdownLink(content, node.getAttribute("href")),
      });

      turndownServiceInstance.addRule("strikethrough", {
        filter: (node) => node.nodeName === "DEL",
        replacement: (content) => `~~${content}~~`,
      });

      turndownServiceInstance.addRule("table", {
        filter: "table",
        replacement: function (content, node) {
          const headerRows = Array.from(node.querySelectorAll("thead tr"));
          const bodyRows = Array.from(node.querySelectorAll("tbody tr"));
          const footerRows = Array.from(node.querySelectorAll("tfoot tr"));

          let allRowsContent = [];

          const getRowCellsContent = (rowElement) => {
            const cells = Array.from(rowElement.querySelectorAll("th, td"));
            return cells.map((cell) =>
              Utils.escapeMd(cell.textContent.replace(/\s+/g, " ").trim())
            );
          };

          if (headerRows.length > 0) {
            allRowsContent.push(getRowCellsContent(headerRows[0]));
          }

          bodyRows.forEach((row) => {
            allRowsContent.push(getRowCellsContent(row));
          });

          footerRows.forEach((row) => {
            allRowsContent.push(getRowCellsContent(row));
          });

          if (allRowsContent.length === 0) {
            return "";
          }

          const maxCols = allRowsContent.reduce((max, row) => Math.max(max, row.length), 0);
          // GFM permits short body rows. Only the first row must match the separator.
          const firstRow = allRowsContent[0];
          while (firstRow.length < maxCols) firstRow.push("");
          const rows = allRowsContent.map((row) => "| " + row.join(" | ") + " |");
          rows.splice(1, 0, "|" + Array(maxCols).fill("---").join("|") + "|");
          return rows.join("\n");
        },
      });

      turndownServiceInstance.addRule("paragraph", {
        filter: "p",
        replacement: (content, node) => {
          if (!content.trim()) return "";

          let currentNode = node.parentNode;
          while (currentNode) {
            if (PARAGRAPH_FILTER_PARENT_NODES.includes(currentNode.nodeName)) {
              return content;
            }
            if (currentNode.nodeName === "LI") {
              return content + "\n";
            }
            currentNode = currentNode.parentNode;
          }
          return `\n\n${content}\n\n`;
        },
      });

      if (platform === CHATGPT) {
        turndownServiceInstance.addRule("popup-div", {
          filter: (node) =>
            node.nodeName === "DIV" &&
            node.classList.contains(CHATGPT_POPUP_DIV_CLASS),
          replacement: (content, node) => "\n\n" + Utils.fencedCode(node.textContent) + "\n\n",
        });
        turndownServiceInstance.addRule("buttonWithSpecificClass", {
          filter: (node) =>
            node.nodeName === "BUTTON" &&
            node.classList.contains(CHATGPT_BUTTON_SPECIFIC_CLASS),
          replacement: (content) =>
            content.trim() ? `__${content}__\n\n` : "",
        });
      }

      if (platform === GEMINI) {
        turndownServiceInstance.addRule("geminiCodeLanguageLabel", {
          filter: (node) =>
            node.nodeName === "SPAN" &&
            node.closest(".code-block-decoration") &&
            node.textContent.trim().length > 0,
          replacement: () => "",
        });
      }

      turndownServiceInstance.addRule("images", {
        filter: (node) => node.nodeName === "IMG",
        replacement: (content, node) => {
          const label = Utils.escapeMd(node.alt || "Image");
          if (node.closest("a")) return Utils.escapeMd(node.alt || "");
          return Utils.markdownLink(label, node.getAttribute("src"));
        },
      });

      turndownServiceInstance.addRule("sub", {
        filter: ["sub"],
        replacement: (content) => {
          return content.trim() ? `<sub>${content}</sub>` : "";
        },
      });

      turndownServiceInstance.addRule("sup", {
        filter: ["sup"],
        replacement: (content) => {
          return content.trim() ? `<sup>${content}</sup>` : "";
        },
      });
    },
  };

  try {
    assertSameConversation();
    // 2. Extract raw chat data based on platform
    let chatData = null;
    if (platform === CHATGPT) {
      chatData = await ChatExporter.extractChatGPTChatData(document);
    } else if (platform === CLAUDE) {
      chatData = await ChatExporter.extractClaudeChatData(document);
    } else if (platform === COPILOT) {
      chatData = await ChatExporter.extractCopilotChatData(document);
    } else if (platform === GEMINI) {
      chatData = await ChatExporter.extractGeminiChatData(document);
    } else if (platform === GROK) {
      chatData = await ChatExporter.extractGrokChatData(document);
    }

    if (!chatData || chatData.messages.length === 0) {
      return {
        success: false,
        error: `No chat messages found for ${platform}. Ensure the page has fully loaded.`,
      };
    }

    assertSameConversation();
    // 3. Set up TurndownService
    const turndownServiceInstance = new TurndownService();
    ChatExporter.setupTurndownRules(turndownServiceInstance);

    // 4. Format and Trigger Download
    let result = null;
    if (format === "markdown") {
      result = ChatExporter.formatToMarkdown(chatData, turndownServiceInstance);
      Utils.downloadFile(result.fileName, result.output, "text/markdown;charset=utf-8");
    } else if (format === "json") {
      result = ChatExporter.formatToJSON(chatData, turndownServiceInstance);
      Utils.downloadFile(result.fileName, result.output, "application/json;charset=utf-8");
    } else {
      return { success: false, error: `Unsupported export format: ${format}` };
    }

    return { success: true, fileName: result.fileName };
  } catch (err) {
    console.error("Extraction error details:", err);
    return { success: false, error: err.message || String(err) };
  }
};

// executeScript returns the URL of the document where the engine was installed.
window.location.href;
