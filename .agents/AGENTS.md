# Workspace Rules — AI Chat Exporter

These rules apply specifically to tasks in the `ai-chat-export` workspace.

## Browser Support
- Target environment: Modern Chrome and Brave browsers (unpacked Manifest V3 developer extension).
- Firefox compatibility is out of scope for now.

## Stack & Style Constraints
- **Core Stack**: Vanilla JavaScript (ES6+), HTML5, and Vanilla CSS. No frontend frameworks (React/Vue/etc.) or TailwindCSS.
- **Chrome APIs**: Use async/await for Chrome Extension API calls. Avoid `.then()` chains.
- **Inline Scripting**: Do NOT include inline `<script>` tags in `popup.html` or inline event handlers (e.g., `onclick="..."`). Use `addEventListener` in `popup.js` instead.
- **Injected Execution**: All DOM scraping and Turndown parsing in `exporter.js` must run within the page's isolated world context. Ensure `exporter.js` is self-contained.

## Licensing Rules
- All code modifications to `exporter.js` must maintain compliance with the original author's MIT license terms. Do not delete the `LICENSE` file.
