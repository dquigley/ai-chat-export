/* popup.js */

const DEFAULT_FILENAME_FORMAT = "{platform}_{title}_{timestampLocal}";
const DEFAULT_TITLE_PREFIX = "✓ ";

const PLATFORM_MAP = {
  "chatgpt.com": { name: "ChatGPT", key: "chatgpt" },
  "chat.openai.com": { name: "ChatGPT", key: "chatgpt" },
  "claude.ai": { name: "Claude", key: "claude" },
  "www.copilot.com": { name: "Copilot", key: "copilot" },
  "copilot.microsoft.com": { name: "Copilot", key: "copilot" },
  "copilot.com": { name: "Copilot", key: "copilot" },
  "gemini.google.com": { name: "Gemini", key: "gemini" },
  "grok.com": { name: "Grok", key: "grok" }
};

// UI Elements
const statusCard = document.getElementById("status-card");
const statusText = document.getElementById("status-text");
const btnExportMd = document.getElementById("btn-export-md");
const btnExportJson = document.getElementById("btn-export-json");
const feedbackMsg = document.getElementById("feedback-message");
const inputFilenameFormat = document.getElementById("input-filename-format");
const inputTitlePrefix = document.getElementById("input-title-prefix");
const btnResetSettings = document.getElementById("btn-reset-settings");

let activeTab = null;
let detectedPlatform = null;

// Initialize Popup
document.addEventListener("DOMContentLoaded", async () => {
  // Load settings
  await loadSettings();

  // Detect Platform
  await detectActivePlatform();

  // Set up event listeners
  inputFilenameFormat.addEventListener("input", saveSettings);
  inputTitlePrefix.addEventListener("input", saveSettings);
  btnResetSettings.addEventListener("click", resetSettings);
  btnExportMd.addEventListener("click", () => handleExport("markdown"));
  btnExportJson.addEventListener("click", () => handleExport("json"));
});

// Load Settings from Local Storage
async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get({
      filenameFormat: DEFAULT_FILENAME_FORMAT,
      titlePrefix: DEFAULT_TITLE_PREFIX
    });
    inputFilenameFormat.value = settings.filenameFormat;
    inputTitlePrefix.value = settings.titlePrefix;
  } catch (err) {
    console.error("Error loading settings:", err);
  }
}

// Save Settings to Local Storage
async function saveSettings() {
  try {
    await chrome.storage.local.set({
      filenameFormat: inputFilenameFormat.value || DEFAULT_FILENAME_FORMAT,
      titlePrefix: inputTitlePrefix.value
    });
  } catch (err) {
    console.error("Error saving settings:", err);
  }
}

// Reset Settings to Defaults
async function resetSettings() {
  try {
    inputFilenameFormat.value = DEFAULT_FILENAME_FORMAT;
    inputTitlePrefix.value = DEFAULT_TITLE_PREFIX;
    await saveSettings();
    showFeedback("Settings reset to defaults.", "success");
  } catch (err) {
    console.error("Error resetting settings:", err);
    showFeedback("Failed to reset settings.", "error");
  }
}

// Detect Active Platform
async function detectActivePlatform() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    if (!tab || !tab.url) {
      setUnsupportedState();
      return;
    }

    const url = new URL(tab.url);
    const host = url.hostname;
    let foundKey = null;

    for (const domain of Object.keys(PLATFORM_MAP)) {
      if (host === domain || host.endsWith("." + domain)) {
        foundKey = domain;
        break;
      }
    }

    if (foundKey) {
      const platform = PLATFORM_MAP[foundKey];
      detectedPlatform = platform.key;
      setActiveState(platform.name);
    } else {
      setUnsupportedState();
    }
  } catch (err) {
    console.error("Error detecting platform:", err);
    setUnsupportedState();
  }
}

function setActiveState(platformName) {
  statusCard.className = "status-card active-platform";
  statusText.innerHTML = `Platform active: <span class="platform-highlight ${detectedPlatform}">${platformName}</span>`;
  btnExportMd.removeAttribute("disabled");
  btnExportJson.removeAttribute("disabled");
}

function setUnsupportedState() {
  statusCard.className = "status-card unsupported";
  statusText.textContent = "Supported only on ChatGPT, Claude, Copilot, Gemini, and Grok pages.";
  btnExportMd.setAttribute("disabled", "true");
  btnExportJson.setAttribute("disabled", "true");
}

// Show feedback message
function showFeedback(message, type) {
  feedbackMsg.textContent = message;
  feedbackMsg.className = `feedback-message ${type}`;
  
  // Clear after 4 seconds
  if (window.feedbackTimeout) {
    clearTimeout(window.feedbackTimeout);
  }
  window.feedbackTimeout = setTimeout(() => {
    feedbackMsg.className = "feedback-message hidden";
  }, 4000);
}

// Handle Export Action
async function handleExport(exportFormat) {
  if (!activeTab) return;

  btnExportMd.setAttribute("disabled", "true");
  btnExportJson.setAttribute("disabled", "true");
  showFeedback(`Exporting chat as ${exportFormat.toUpperCase()}...`, "warning");

  try {
    // 1. Inject the exporter.js file containing Turndown and extraction logic
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ["exporter.js"]
    });

    // 2. Call the run function with the settings
    const filenameFormat = inputFilenameFormat.value || DEFAULT_FILENAME_FORMAT;
    const titlePrefix = inputTitlePrefix.value;

    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: async (format, filenameFormatStr, titlePrefixStr) => {
        if (typeof window.aiChatExporterRun === "function") {
          return await window.aiChatExporterRun(format, filenameFormatStr, titlePrefixStr);
        }
        return { success: false, error: "Exporter engine failed to initialize on the page." };
      },
      args: [exportFormat, filenameFormat, titlePrefix]
    });

    if (results && results[0] && results[0].result) {
      const response = results[0].result;
      if (response.success) {
        showFeedback(`Exported successfully! File: ${response.fileName}`, "success");
      } else {
        showFeedback(`Export failed: ${response.error}`, "error");
      }
    } else {
      showFeedback("Could not get response from exporter script.", "error");
    }
  } catch (err) {
    console.error("Export script execution failed:", err);
    showFeedback(`Export error: ${err.message || err}`, "error");
  } finally {
    // Re-enable buttons if platform is still active
    if (detectedPlatform) {
      btnExportMd.removeAttribute("disabled");
      btnExportJson.removeAttribute("disabled");
    }
  }
}
