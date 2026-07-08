# AGENT.md — General AI Assistant Rules

This file provides context and developer guidelines for AI coding assistants working on the **AI Chat Exporter** codebase.

## Codebase Summary
This project is a standalone Manifest V3 browser extension for exporting conversations from AI chat platforms (ChatGPT, Claude, Copilot, Gemini, Grok) as Markdown or JSON.

## Key Rules for AI Agents
1. **Developer-Mode Support**: The extension must remain compatible with unpacked developer installations. Do not introduce dependencies that require build processes (`npm run build`, Webpack, Babel).
2. **Minimalist Style**: Use vanilla CSS in `popup.css`. Do not add TailwindCSS or component framework libraries (React, Vue) unless specifically requested by the user.
3. **No Inline Scripts**: Keep HTML files strictly structure-only. All JavaScript event handlers must be attached dynamically using `addEventListener` in script files (`popup.js`).
4. **Isolated Extraction**: `exporter.js` is executed in the isolated world of the tab's page context. All helper classes (`TurndownService`, `Utils`) must be fully defined inside `exporter.js` or inlined during execution so they are self-contained.
5. **No Network Requests in Content Scripts**: Keep the extension privacy-friendly. The extension should never send chat logs, metadata, or tracking information over the network.
