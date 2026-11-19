/* popup.js */

const DEFAULT_FILENAME_FORMAT = "{platform}_{title}_{timestampLocal}";
const DEFAULT_TITLE_PREFIX = "✓ ";
const DEFAULT_FRONTMATTER_FIELDS = [
  { key: "title", label: "Title", enabled: true, name: "title", example: "\"Chat Title\"" },
  { key: "tags", label: "Tags", enabled: true, name: "tags", example: "[chatgpt, ai-export]" },
  { key: "author", label: "Platform", enabled: true, name: "author", example: "chatgpt" },
  { key: "count", label: "Count", enabled: true, name: "count", example: "12" },
  { key: "exporter", label: "Exporter", enabled: true, name: "exporter", example: "AI Chat Exporter v3.1.0" },
  { key: "date", label: "Date", enabled: true, name: "date", example: "2026-07-08T14-30-00-0500" },
  { key: "url", label: "Source URL", enabled: true, name: "url", example: "https://chatgpt.com/..." }
];

const PLATFORM_MAP = new Map(Object.entries({
  "chatgpt.com": { name: "ChatGPT", key: "chatgpt" },
  "chat.openai.com": { name: "ChatGPT", key: "chatgpt" },
  "claude.ai": { name: "Claude", key: "claude" },
  "www.copilot.com": { name: "Copilot", key: "copilot" },
  "copilot.microsoft.com": { name: "Copilot", key: "copilot" },
  "copilot.com": { name: "Copilot", key: "copilot" },
  "gemini.google.com": { name: "Gemini", key: "gemini" },
  "grok.com": { name: "Grok", key: "grok" }
}));

// UI Elements
const statusCard = document.getElementById("status-card");
const statusText = document.getElementById("status-text");
const btnExportMd = document.getElementById("btn-export-md");
const btnExportJson = document.getElementById("btn-export-json");
const feedbackMsg = document.getElementById("feedback-message");
const inputFilenameFormat = document.getElementById("input-filename-format");
const inputTitlePrefix = document.getElementById("input-title-prefix");
const frontmatterFields = document.getElementById("frontmatter-fields");
const customFrontmatterFields = document.getElementById("custom-frontmatter-fields");
const btnAddCustomFrontmatter = document.getElementById("btn-add-custom-frontmatter");
const btnResetSettings = document.getElementById("btn-reset-settings");

let activeTab = null;
let detectedPlatform = null;

// Initialize Popup
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadSettings();
  } catch (err) {
    statusCard.className = "status-card unsupported";
    statusText.textContent = "Could not load export settings. Reopen the popup to retry.";
    console.error("Error loading settings:", err);
    return;
  }
  await detectActivePlatform();

  inputFilenameFormat.addEventListener("input", saveSettings);
  inputTitlePrefix.addEventListener("input", saveSettings);
  frontmatterFields.addEventListener("input", saveSettings);
  frontmatterFields.addEventListener("change", saveSettings);
  customFrontmatterFields.addEventListener("input", saveSettings);
  customFrontmatterFields.addEventListener("change", saveSettings);
  customFrontmatterFields.addEventListener("click", handleCustomFrontmatterClick);
  btnAddCustomFrontmatter.addEventListener("click", addCustomFrontmatterField);
  btnResetSettings.addEventListener("click", resetSettings);
  btnExportMd.addEventListener("click", () => handleExport("markdown"));
  btnExportJson.addEventListener("click", () => handleExport("json"));
});

function getDefaultFrontmatterFields() {
  return DEFAULT_FRONTMATTER_FIELDS.map((field) => ({ ...field }));
}

function normalizeFrontmatterFields(fields) {
  const storedFields = Array.isArray(fields) ? fields : [];

  return DEFAULT_FRONTMATTER_FIELDS.map((defaultField) => {
    const storedField = storedFields.find((field) => field?.key === defaultField.key);
    return {
      ...defaultField,
      enabled: storedField && typeof storedField.enabled === "boolean"
        ? storedField.enabled
        : defaultField.enabled,
      name: storedField && typeof storedField.name === "string" && storedField.name.trim()
        ? storedField.name.trim()
        : defaultField.name
    };
  });
}

function normalizeCustomFrontmatterFields(fields) {
  if (!Array.isArray(fields)) return [];

  return fields
    .filter((field) => field && (field.name || field.value))
    .map((field) => ({
      enabled: field.enabled !== false,
      name: typeof field.name === "string" ? field.name.trim() : "",
      value: typeof field.value === "string" ? field.value : ""
    }));
}

// Load Settings from Local Storage
async function loadSettings() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const settings = await chrome.storage.local.get({
    filenameFormat: DEFAULT_FILENAME_FORMAT,
    titlePrefix: DEFAULT_TITLE_PREFIX,
    frontmatterFields: getDefaultFrontmatterFields(),
    customFrontmatterFields: []
  });

  inputFilenameFormat.value = settings.filenameFormat;
  inputTitlePrefix.value = settings.titlePrefix;
  renderFrontmatterFields(normalizeFrontmatterFields(settings.frontmatterFields));
  renderCustomFrontmatterFields(normalizeCustomFrontmatterFields(settings.customFrontmatterFields));
}

function createFrontmatterRow(field) {
  const row = document.getElementById("frontmatter-row-template").content.firstElementChild.cloneNode(true);
  row.dataset.key = field.key;
  row.querySelector(".frontmatter-enabled").setAttribute("aria-label", `Include ${field.label}`);
  row.querySelector(".frontmatter-name-input").setAttribute("aria-label", `${field.label} property name`);
  row.querySelector(".frontmatter-enabled").checked = field.enabled;
  row.querySelector("strong").textContent = field.label;
  row.querySelector("span").textContent = field.example;
  row.querySelector(".frontmatter-name-input").value = field.name;

  return row;
}

function createCustomFrontmatterRow(field = { enabled: true, name: "", value: "" }) {
  const row = document.getElementById("custom-frontmatter-row-template").content.firstElementChild.cloneNode(true);
  row.querySelector(".frontmatter-enabled").checked = field.enabled !== false;
  row.querySelector(".frontmatter-name-input").value = field.name || "";
  row.querySelector(".frontmatter-value-input").value = field.value || "";

  return row;
}

function renderFrontmatterFields(fields) {
  frontmatterFields.replaceChildren(...fields.map(createFrontmatterRow));
}

function renderCustomFrontmatterFields(fields) {
  customFrontmatterFields.replaceChildren(...fields.map(createCustomFrontmatterRow));
}

function addCustomFrontmatterField() {
  customFrontmatterFields.appendChild(createCustomFrontmatterRow());
  saveSettings();
}

function handleCustomFrontmatterClick(event) {
  const removeButton = event.target.closest(".frontmatter-remove-btn");
  if (!removeButton) return;

  removeButton.closest(".frontmatter-row").remove();
  saveSettings();
}

function getFrontmatterSettings() {
  const builtInFields = Array.from(frontmatterFields.querySelectorAll(".frontmatter-row")).map((row) => ({
    key: row.dataset.key,
    enabled: row.querySelector(".frontmatter-enabled").checked,
    name: row.querySelector(".frontmatter-name-input").value.trim()
  }));

  const customFields = Array.from(customFrontmatterFields.querySelectorAll(".frontmatter-row")).map((row) => ({
    enabled: row.querySelector(".frontmatter-enabled").checked,
    name: row.querySelector(".frontmatter-name-input").value.trim(),
    value: row.querySelector(".frontmatter-value-input").value
  }));

  return {
    fields: builtInFields,
    customFields: customFields.filter((field) => field.name || field.value)
  };
}

function validateFrontmatterSettings(settings) {
  const yamlKeyPattern = /^[A-Za-z_][A-Za-z0-9_-]*$/;
  const enabledFields = [...settings.fields, ...settings.customFields];
  const names = new Set();

  for (const field of enabledFields) {
    if (!field.name) {
      return "Enabled frontmatter properties must have a name.";
    }
    if (!yamlKeyPattern.test(field.name)) {
      return `Invalid frontmatter property name: ${field.name}`;
    }
    if (names.has(field.name)) {
      return `Duplicate frontmatter property name: ${field.name}`;
    }
    names.add(field.name);
  }

  return "";
}

// Save Settings to Local Storage
async function saveSettings() {
  try {
    const frontmatterSettings = getFrontmatterSettings();
    await chrome.storage.local.set({
      filenameFormat: inputFilenameFormat.value || DEFAULT_FILENAME_FORMAT,
      titlePrefix: inputTitlePrefix.value,
      frontmatterFields: frontmatterSettings.fields,
      customFrontmatterFields: frontmatterSettings.customFields
    });
    return true;
  } catch (err) {
    console.error("Error saving settings:", err);
    showFeedback("Could not save export settings.", "error");
    return false;
  }
}

// Reset Settings to Defaults
async function resetSettings() {
  try {
    inputFilenameFormat.value = DEFAULT_FILENAME_FORMAT;
    inputTitlePrefix.value = DEFAULT_TITLE_PREFIX;
    renderFrontmatterFields(getDefaultFrontmatterFields());
    renderCustomFrontmatterFields([]);
    if (await saveSettings()) showFeedback("Settings reset to defaults.", "success");
  } catch (err) {
    console.error("Error resetting settings:", err);
    showFeedback("Failed to reset settings.", "error");
  }
}

function getPlatform(tabUrl) {
  const url = new URL(tabUrl);
  return url.protocol === "https:" && !url.port && !url.username && !url.password
    ? PLATFORM_MAP.get(url.hostname)
    : null;
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

    const platform = getPlatform(tab.url);
    if (platform) {
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
  const highlight = document.createElement("span");
  highlight.className = `platform-highlight ${detectedPlatform}`;
  highlight.textContent = platformName;
  statusText.replaceChildren("Platform active: ", highlight);
  btnExportMd.removeAttribute("disabled");
  btnExportJson.removeAttribute("disabled");
}

function setUnsupportedState() {
  detectedPlatform = null;
  statusCard.className = "status-card unsupported";
  statusText.textContent = "Supported only on ChatGPT, Claude, Copilot, Gemini, and Grok pages.";
  btnExportMd.setAttribute("disabled", "true");
  btnExportJson.setAttribute("disabled", "true");
}

// Show feedback message
function showFeedback(message, type) {
  feedbackMsg.textContent = message;
  feedbackMsg.className = `feedback-message ${type}`;

  if (window.feedbackTimeout) {
    clearTimeout(window.feedbackTimeout);
  }
  window.feedbackTimeout = setTimeout(() => {
    feedbackMsg.className = "feedback-message hidden";
  }, 4000);
}

// Handle Export Action
async function handleExport(exportFormat) {
  if (!activeTab || !detectedPlatform) return;

  const request = {
    format: exportFormat,
    filenameFormat: inputFilenameFormat.value || DEFAULT_FILENAME_FORMAT,
    platform: detectedPlatform,
    expectedUrl: activeTab.url
  };
  if (detectedPlatform === "gemini") request.titlePrefix = inputTitlePrefix.value;
  if (exportFormat === "markdown") {
    const { fields, customFields } = getFrontmatterSettings();
    request.frontmatterConfig = {
      fields: fields.filter(field => field.enabled).map(({ key, name }) => ({ key, name })),
      customFields: customFields.filter(field => field.enabled).map(({ name, value }) => ({ name, value }))
    };
    const validationError = validateFrontmatterSettings(request.frontmatterConfig);
    if (validationError) {
      showFeedback(validationError, "error");
      return;
    }
  }

  btnExportMd.setAttribute("disabled", "true");
  btnExportJson.setAttribute("disabled", "true");
  showFeedback(`Exporting chat as ${exportFormat.toUpperCase()}...`, "warning");

  try {
    if (!await saveSettings()) return;

    // 1. Inject the exporter.js file containing Turndown and extraction logic
    const [loaded] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      world: "ISOLATED",
      files: ["exporter.js"]
    });

    if (!loaded?.documentId || loaded.result !== activeTab.url) {
      throw new Error("The active page changed. Reopen the popup on the conversation to export.");
    }

    // Deliver settings only to the document loaded above.
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id, documentIds: [loaded.documentId] },
      world: "ISOLATED",
      func: (request) => window.aiChatExporterRun(request),
      args: [request]
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
