/* exporter.js */

(function () {
  "use strict";

  const EXPORTER_VERSION = "3.1.0";

  // --- Hostname-Specific Selectors & Identifiers ---
  const CHATGPT = "chatgpt";
  const CHATGPT_HOSTNAMES = ["chat.openai.com", "chatgpt.com"];
  const CHATGPT_TITLE_REPLACE_TEXT = " - ChatGPT";
  const CHATGPT_ARTICLE_SELECTOR = "section[data-testid^='conversation-turn-']";
  const CHATGPT_HEADER_SELECTOR = "h4";
  const CHATGPT_USER_MESSAGE_INDICATOR = "you said";
  const CHATGPT_POPUP_DIV_CLASS = "popover";
  const CHATGPT_BUTTON_SPECIFIC_CLASS = "text-sm";

  const GEMINI = "gemini";
  const GEMINI_HOSTNAMES = ["gemini.google.com"];
  const GEMINI_TITLE_REPLACE_TEXT = "Gemini - ";
  const GEMINI_MESSAGE_ITEM_SELECTOR = "user-query, model-response";
  const GEMINI_SIDEBAR_ACTIVE_CHAT_SELECTOR = 'a[data-test-id="conversation"].selected .conversation-title';
  const GEMINI_TOPBAR_ACTIVE_CHAT_SELECTOR = "conversation-actions .conversation-title";

  const CLAUDE = "claude";
  const CLAUDE_HOSTNAMES = ["claude.ai"];
  const CLAUDE_MESSAGE_SELECTOR = ".font-claude-response:not(#markdown-artifact), [data-testid='user-message']";
  const CLAUDE_USER_MESSAGE_SELECTOR = '[data-testid="user-message"]';
  const CLAUDE_THINKING_BLOCK_CLASS = "transition-all";
  const CLAUDE_ARTIFACT_BLOCK_CELL = ".artifact-block-cell";

  const COPILOT = "copilot";
  const COPILOT_HOSTNAMES = ["www.copilot.com", "copilot.microsoft.com", "copilot.com"];
  const COPILOT_MESSAGE_SELECTOR = ".group\\/user-message, .group\\/ai-message";
  const COPILOT_USER_MESSAGE_SELECTOR = ".group\\/user-message";

  const GROK = "grok";
  const GROK_HOSTNAMES = ["grok.com"];
  const GROK_MESSAGE_SELECTOR = "div[id^='response-']";
  const GROK_CONTENT_SELECTOR = ".response-content-markdown";
  const GROK_USER_INDICATOR = ".items-end";

  const HOSTNAME = window.location.hostname;
  const CURRENT_PLATFORM = (() => {
    if (CHATGPT_HOSTNAMES.some((host) => HOSTNAME.includes(host))) {
      return CHATGPT;
    }
    if (CLAUDE_HOSTNAMES.some((host) => HOSTNAME.includes(host))) {
      return CLAUDE;
    }
    if (COPILOT_HOSTNAMES.some((host) => HOSTNAME.includes(host))) {
      return COPILOT;
    }
    if (GEMINI_HOSTNAMES.some((host) => HOSTNAME.includes(host))) {
      return GEMINI;
    }
    if (GROK_HOSTNAMES.some((host) => HOSTNAME.includes(host))) {
      return GROK;
    }
    return "unknown";
  })();

  // --- Settings Variables (Configured on Run) ---
  let _filenameFormat = "{platform}_{title}_{timestampLocal}";
  let _titlePrefix = "✓ ";

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
      let output = "";

      const process = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
        if (node.nodeType !== Node.ELEMENT_NODE) return "";

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

      let parsedRootNode = rootNode;
      if (typeof rootNode === "string") {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rootNode, "text/html");
        parsedRootNode = doc.body || doc.documentElement;
      }

      output = Array.from(parsedRootNode.childNodes)
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
      return text.replace(/[|\\`*_{}\[\]()#+\-!>]/g, "\\$&");
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
        "{platform}": CURRENT_PLATFORM,
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

      let formattedFilename = format;
      for (const placeholder in replacements) {
        if (replacements.hasOwnProperty(placeholder)) {
          formattedFilename = formattedFilename
            .split(placeholder)
            .join(replacements[placeholder]);
        }
      }

      return Utils.slugify(
        `${formattedFilename.replace(/(_+|-+)$/, "")}.${ext}`,
        false
      );
    },

    parseChatTitleAndTags(rawTitle) {
      const tags = [];
      let cleanedTitle = rawTitle.trim();

      const tagRegex = /(^|\s+)#(\S+)/g;
      let match;

      while ((match = tagRegex.exec(cleanedTitle)) !== null) {
        const tagName = match[2];
        if (!/^\d+$/.test(tagName)) {
          tags.push(tagName);
        }
      }

      cleanedTitle = cleanedTitle.replace(/(^|\s+)#\S+/g, " ").trim();
      cleanedTitle = cleanedTitle.replace(/\s+/g, " ").trim();

      return {
        title: cleanedTitle,
        tags: tags,
      };
    },

    getCleanUrl() {
      try {
        return window.location.origin + window.location.pathname;
      } catch (e) {
        return window.location.href;
      }
    },
  };

  // --- Core Export Logic ---
  const ChatExporter = {
    extractChatGPTChatData(doc) {
      const articles = [...doc.querySelectorAll(CHATGPT_ARTICLE_SELECTOR)];
      if (articles.length === 0) return null;

      let title =
        doc.title.replace(CHATGPT_TITLE_REPLACE_TEXT, "").trim() ||
        DEFAULT_CHAT_TITLE;
      const messages = [];
      let chatIndex = 1;

      for (const article of articles) {
        const turnType = article.getAttribute("data-turn");
        const header =
          article.querySelector(CHATGPT_HEADER_SELECTOR)?.textContent?.trim() ||
          "";

        const isUser =
          turnType === "user" ||
          header.toLowerCase().includes(CHATGPT_USER_MESSAGE_INDICATOR);
        const author = isUser ? "user" : "ai";

        const contentTarget = article.querySelector(
          ".markdown, .whitespace-pre-wrap"
        );
        const contentHtml = contentTarget || article;
        const contentText = contentHtml.innerText.trim();

        if (!contentText) continue;

        const messageId = `${author}-${chatIndex}-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)}`;

        messages.push({
          id: messageId,
          author: author,
          contentHtml: contentHtml,
          contentText: contentText,
          timestamp: new Date(),
          originalIndex: chatIndex,
        });

        if (!isUser) chatIndex++;
      }

      const _parsedTitle = Utils.parseChatTitleAndTags(title);

      return {
        _raw_title: title,
        title: _parsedTitle.title,
        tags: _parsedTitle.tags,
        author: CURRENT_PLATFORM,
        messages: messages,
        messageCount: messages.filter((m) => m.author === "user").length,
        exportedAt: new Date(),
        exporterVersion: EXPORTER_VERSION,
        threadUrl: Utils.getCleanUrl(),
      };
    },

    extractClaudeChatData(doc) {
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
          const claudeResponseContent = document.createElement("div");
          Array.from(item.children).forEach((child) => {
            const isThinkingBlock = child.className.includes(
              CLAUDE_THINKING_BLOCK_CLASS
            );
            const isArtifactBlock =
              (child.className.includes("pt-3") &&
                child.className.includes("pb-3")) ||
              child.querySelector(CLAUDE_ARTIFACT_BLOCK_CELL);

            if (!isThinkingBlock && !isArtifactBlock) {
              const contentGrid = child.querySelector(".grid-cols-1");
              if (contentGrid) {
                claudeResponseContent.appendChild(contentGrid.cloneNode(true));
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
        author: CURRENT_PLATFORM,
        messages: messages,
        messageCount: messages.filter((m) => m.author === "user").length,
        exportedAt: new Date(),
        exporterVersion: EXPORTER_VERSION,
        threadUrl: Utils.getCleanUrl(),
      };
    },

    extractCopilotChatData(doc) {
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
          contentHtml: isUser
            ? messageContentElem
            : messageContentElem.cloneNode(true),
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

    extractGeminiChatData(doc) {
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

      const configuredPrefix = _titlePrefix;

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
        author: CURRENT_PLATFORM,
        messages: messages,
        messageCount: messages.filter((m) => m.author === "user").length,
        exportedAt: new Date(),
        exporterVersion: EXPORTER_VERSION,
        threadUrl: Utils.getCleanUrl(),
      };
    },

    extractGrokChatData(doc) {
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

        const clonedContent = isUser
          ? messageContentElem
          : messageContentElem.cloneNode(true);

        messages.push({
          id: messageId,
          author: author,
          contentHtml: clonedContent,
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
            msg.contentText.replace(/\n/g, "\n> ") +
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
            markdownContent = `[CONVERSION ERROR: Failed to render this section. Original content below]\n\n\`\`\`\n${msg.contentText}\n\`\`\`\n`;
          }
          content += markdownContent + "\n\n" + MARKDOWN_BACK_TO_TOP_LINK;
        }
      });

      const localTime = Utils.formatLocalTime(chatData.exportedAt);

      const yaml = `---\ntitle: "${chatData.title.replaceAll(
        '"',
        '\\"'
      )}"\ntags: [${chatData.tags.join(", ")}]\nauthor: ${
        chatData.author
      }\ncount: ${
        chatData.messageCount
      }\nexporter: ${EXPORTER_VERSION}\ndate: ${localTime}\nurl: ${
        chatData.threadUrl
      }\n---\n`;
      const tocBlock = `## Table of Contents\n\n${toc.trim()}\n\n`;

      const finalOutput =
        yaml + `\n# ${chatData.title}\n\n` + tocBlock + content.trim() + "\n\n";

      const fileName = Utils.formatFileName(
        _filenameFormat,
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
            markdownContent = `[CONVERSION ERROR: Failed to render this section.]: ${msg.contentText}`;
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
        _filenameFormat,
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
      if (CURRENT_PLATFORM === CHATGPT) {
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

      if (CURRENT_PLATFORM === COPILOT) {
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

            return "\n\n```" + language + "\n" + codeText + "\n```\n\n";
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

            return `[${linkText}](${node.getAttribute("href")}) `;
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

      if (CURRENT_PLATFORM === CLAUDE) {
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

            return "\n\n```" + language + "\n" + codeText + "\n```\n\n";
          },
        });
      }

      if (CURRENT_PLATFORM === GROK) {
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

            const existingFence = content.match(/```[\w]*\n([\s\S]*?)\n```/);
            if (existingFence) {
              const codeText = existingFence[1].trim();
              if (codeText) return `\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;
            }

            let codeText = content;
            if (langSpan) {
              const langLabel = langSpan.textContent.trim();
              if (codeText.startsWith(langLabel)) {
                codeText = codeText.slice(langLabel.length);
              }
            }
            codeText = codeText.replace(/^(Collapse|Run|Copy|Wrap)+/, "");
            codeText = codeText.trim();

            if (!codeText) return "";
            return `\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;
          },
        });
      }

      turndownServiceInstance.addRule("code", {
        filter: "code",
        replacement: (content, node) => {
          if (node.parentNode.nodeName === "PRE") return content;

          if (
            typeof CURRENT_PLATFORM !== "undefined" &&
            CURRENT_PLATFORM === GROK
          ) {
            if (node.closest && node.closest('[data-testid="code-block"]')) {
              return content;
            }
          }

          return `\`${content}\``;
        },
      });

      turndownServiceInstance.addRule("pre", {
        filter: "pre",
        replacement: (content, node) => {
          let lang = "";
          let codeText = "";

          if (
            typeof CURRENT_PLATFORM !== "undefined" &&
            CURRENT_PLATFORM === GEMINI
          ) {
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

          if (
            typeof CURRENT_PLATFORM !== "undefined" &&
            CURRENT_PLATFORM === CHATGPT
          ) {
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

          if (!codeText && !codeElement) return content;

          if (!lang && codeElement && codeElement.className) {
            const match = codeElement.className.match(/language-(\w+)/);
            if (match) lang = match[1];
          }

          const cleanCode = (codeText || "").trim();
          const safeLang = (lang || "").toLowerCase();

          let prefix = "\n";
          let prevSibling = node.previousElementSibling;
          if (prevSibling && prevSibling.nodeName === "P") {
            let parentLi = prevSibling.closest("li");
            if (parentLi && parentLi.contains(node)) {
              prefix = "\n\n";
            }
          }

          return `${prefix}\`\`\`${safeLang}\n${cleanCode}\n\`\`\`\n`;
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
          `[${content}](${node.getAttribute("href")})`,
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
              cell.textContent.replace(/\s+/g, " ").trim()
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

          const isFirstRowAHeader = headerRows.length > 0;
          const maxCols = Math.max(...allRowsContent.map((row) => row.length));

          const paddedRows = allRowsContent.map((row) => {
            const paddedRow = [...row];
            while (paddedRow.length < maxCols) {
              paddedRow.push("");
            }
            return paddedRow;
          });

          let markdownTable = "";

          if (isFirstRowAHeader) {
            markdownTable += "| " + paddedRows[0].join(" | ") + " |\n";
            markdownTable += "|" + Array(maxCols).fill("---").join("|") + "|\n";
            for (let i = 1; i < paddedRows.length; i++) {
              markdownTable += "| " + paddedRows[i].join(" | ") + " |\n";
            }
          } else {
            for (let i = 0; i < paddedRows.length; i++) {
              markdownTable += "| " + paddedRows[i].join(" | ") + " |\n";
              if (i === 0) {
                markdownTable +=
                  "|" + Array(maxCols).fill("---").join("|") + "|\n";
              }
            }
          }

          return markdownTable.trim();
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

      if (CURRENT_PLATFORM === CHATGPT) {
        turndownServiceInstance.addRule("popup-div", {
          filter: (node) =>
            node.nodeName === "DIV" &&
            node.classList.contains(CHATGPT_POPUP_DIV_CLASS),
          replacement: (content) => {
            const textWithLineBreaks = content
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/<\/(p|div|h[1-6]|ul|ol|li)>/gi, "\n")
              .replace(/<(?:p|div|h[1-6]|ul|ol|li)[^>]*>/gi, "\n")
              .replace(/<\/?[^>]+(>|$)/g, "")
              .replace(/\n+/g, "\n");
            return "\n```\n" + textWithLineBreaks + "\n```\n";
          },
        });
        turndownServiceInstance.addRule("buttonWithSpecificClass", {
          filter: (node) =>
            node.nodeName === "BUTTON" &&
            node.classList.contains(CHATGPT_BUTTON_SPECIFIC_CLASS),
          replacement: (content) =>
            content.trim() ? `__${content}__\n\n` : "",
        });
      }

      if (CURRENT_PLATFORM === GEMINI) {
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
          const src = node.getAttribute("src") || "";
          const alt = node.alt || "";
          return src ? `![${alt}](${src})` : "";
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

  // --- External Entry Point called by popup.js ---
  window.aiChatExporterRun = async function (format, filenameFormat, titlePrefix) {
    // 1. Update settings passed from the extension popup
    _filenameFormat = filenameFormat;
    _titlePrefix = titlePrefix;

    if (CURRENT_PLATFORM === "unknown") {
      return { success: false, error: "The exporter does not support this hostname." };
    }

    try {
      // 2. Extract raw chat data based on platform
      let chatData = null;
      if (CURRENT_PLATFORM === CHATGPT) {
        chatData = ChatExporter.extractChatGPTChatData(document);
      } else if (CURRENT_PLATFORM === CLAUDE) {
        chatData = ChatExporter.extractClaudeChatData(document);
      } else if (CURRENT_PLATFORM === COPILOT) {
        chatData = ChatExporter.extractCopilotChatData(document);
      } else if (CURRENT_PLATFORM === GEMINI) {
        chatData = ChatExporter.extractGeminiChatData(document);
      } else if (CURRENT_PLATFORM === GROK) {
        chatData = ChatExporter.extractGrokChatData(document);
      }

      if (!chatData || chatData.messages.length === 0) {
        return {
          success: false,
          error: `No chat messages found for ${CURRENT_PLATFORM}. Ensure the page has fully loaded.`,
        };
      }

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
})();
