# CLAUDE.md — AI Chat Exporter Browser Extension

This document provides developer guidelines, project structure, and style rules for the **AI Chat Exporter Browser Extension**.

## Project Overview
A standalone Manifest V3 browser extension for Chrome and Brave. It extracts chat conversations client-side from **ChatGPT, Claude, Copilot, Gemini, and Grok** and formats them as Markdown or JSON.

## Project Structure
- **`manifest.json`**: Extension configuration, action popups, and permissions (`activeTab`, `scripting`, `storage`).
- **`popup.html`**: UI layout for the extension toolbar action, styled with glassmorphism and the Outfit Google Font.
- **`popup.css`**: Premium dark-mode variables, glows, hover scaling, and status color states.
- **`popup.js`**: Hostname matching logic, storage configuration hooks, and scripting injection triggers.
- **`exporter.js`**: Core page-injected engine. Contains the customized `TurndownService` and platform-specific DOM parsing/formatting selectors.
- **`icons/`**: Standard PNG files (`icon-16.png`, `icon-48.png`, `icon-128.png`) displaying the extension logo.

## Development Workflows

### Installation / Setup
1. Open Chrome or Brave and go to `chrome://extensions/` (or `brave://extensions/`).
2. Toggle on **Developer mode** (top-right).
3. Click **Load unpacked** (top-left) and select the extension directory.

### Applying Changes
After editing `popup.js`, `exporter.js`, `popup.css`, or `popup.html`:
1. Go to `chrome://extensions/`.
2. Click the **Reload** (circular arrow) button on the **AI Chat Exporter** card.

## Coding Guidelines
- **Core Technology**: Use vanilla JavaScript, HTML, and CSS. Avoid third-party UI libraries or build steps.
- **Asynchronous Code**: Always use `async`/`await` for Chrome Extension API calls. Avoid `.then()` chains.
- **DOM Parsing**: Selectors for target platforms in `exporter.js` must be kept up-to-date with upstream changes.
- **Isolated Execution**: `exporter.js` is injected into the page's isolated world context. Wrap logic inside a self-invoking function (IIFE) to avoid global namespace conflicts.
- **Download context**: Downloads must be triggered from the active tab's document context via blob objects (`URL.createObjectURL`).
