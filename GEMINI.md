# GEMINI.md — AI Chat Exporter Browser Extension

This file defines the project guidelines and architectural rules for **Gemini-based** AI coding assistants working on the AI Chat Exporter extension.

## Extension Architecture
The project is built around **Manifest V3** standard protocols:
- **No Background Service Worker Overhead**: Rather than running persistent content scripts on every page load, the extension requests `activeTab` and `scripting` permissions to dynamically inject the parsing script (`exporter.js`) only when the user clicks the browser action buttons.
- **Client-Side Storage**: Configuration settings (like the filename format and title prefix) are stored using `chrome.storage.local`.

## Directory Map
- `manifest.json`: Extension Manifest.
- `popup.html`: The HTML layout for the toolbar popup.
- `popup.css`: Vanilla CSS for the glassmorphic dark theme.
- `popup.js`: Script driving popup interactions and script injection.
- `exporter.js`: The parsing and Markdown conversion library.
- `icons/`: Circle-arrow PNG files (`icon-16.png`, `icon-48.png`, `icon-128.png`).

## Operational Rules for Gemini
1. **DOM Selector Stability**: Check the platform selectors in `exporter.js` if exports break. Platforms like ChatGPT or Claude frequently update their class names and wrapper tags.
2. **Vanilla Framework Strategy**: Do not introduce build steps, npm compilation scripts, Webpack, or Vite. Keep the extension lightweight, plain-JavaScript, and zero-dependency.
3. **No Global State in Service Workers**: If a service worker is added in the future, save all persistent states to `chrome.storage.local` to prevent loss when the service worker terminates.
4. **License Integrity**: Any edits or updates to `exporter.js` must maintain compliance with the original author's MIT license terms. Keep the `LICENSE` file intact.
5. **No inline scripts or handlers**: Ensure all HTML events are bound via `addEventListener` in script files, as inline script blocks are blocked by Chrome's default Extension CSP.
