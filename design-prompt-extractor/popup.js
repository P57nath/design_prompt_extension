(function () {
  "use strict";

  const ANALYZER_FILES = ["utils/colorUtils.js", "utils/domUtils.js", "contentScript.js"];
  const SETTINGS_KEY = "dpe_settings_v1";
  const DEFAULT_SETTINGS = {
    includeColors: true,
    includeTypography: true,
    includeLayout: true,
    includeComponents: true,
    includeResponsive: true,
    outputStyle: "detailed"
  };

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    analysis: null,
    prompt: ""
  };

  const ui = {
    analyzeBtn: document.getElementById("analyzeBtn"),
    generateBtn: document.getElementById("generateBtn"),
    copyBtn: document.getElementById("copyBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    statusText: document.getElementById("statusText"),
    promptOutput: document.getElementById("promptOutput"),
    includeColors: document.getElementById("includeColors"),
    includeTypography: document.getElementById("includeTypography"),
    includeLayout: document.getElementById("includeLayout"),
    includeComponents: document.getElementById("includeComponents"),
    includeResponsive: document.getElementById("includeResponsive"),
    outputStyle: document.getElementById("outputStyle")
  };

  function setStatus(message, type) {
    ui.statusText.textContent = message;
    ui.statusText.className = "status";
    if (type === "success") ui.statusText.classList.add("status-success");
    else if (type === "warning") ui.statusText.classList.add("status-warning");
    else if (type === "error") ui.statusText.classList.add("status-error");
    else ui.statusText.classList.add("status-idle");
  }

  function setButtonsBusy(busy) {
    ui.analyzeBtn.disabled = busy;
    ui.generateBtn.disabled = busy;
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  function isAnalyzableUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
  }

  async function ensureAnalyzerInjected(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ANALYZER_FILES
    });
  }

  async function analyzeCurrentPage() {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      throw new Error("No active tab was found.");
    }
    if (!isAnalyzableUrl(tab.url)) {
      throw new Error("This page cannot be analyzed. Open a regular http/https webpage.");
    }

    await ensureAnalyzerInjected(tab.id);

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "ANALYZE_PAGE",
      settings: state.settings
    });

    if (!response || !response.ok || !response.analysis) {
      throw new Error((response && response.error) || "Analysis failed.");
    }

    state.analysis = response.analysis;
    return response.analysis;
  }

  function settingsFromUi() {
    return {
      includeColors: ui.includeColors.checked,
      includeTypography: ui.includeTypography.checked,
      includeLayout: ui.includeLayout.checked,
      includeComponents: ui.includeComponents.checked,
      includeResponsive: ui.includeResponsive.checked,
      outputStyle: ui.outputStyle.value
    };
  }

  function applySettingsToUi(settings) {
    ui.includeColors.checked = !!settings.includeColors;
    ui.includeTypography.checked = !!settings.includeTypography;
    ui.includeLayout.checked = !!settings.includeLayout;
    ui.includeComponents.checked = !!settings.includeComponents;
    ui.includeResponsive.checked = !!settings.includeResponsive;
    ui.outputStyle.value = settings.outputStyle || "detailed";
  }

  async function saveSettings() {
    state.settings = settingsFromUi();
    await chrome.storage.local.set({ [SETTINGS_KEY]: state.settings });
  }

  async function loadSettings() {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...(stored && stored[SETTINGS_KEY] ? stored[SETTINGS_KEY] : {})
    };
    applySettingsToUi(state.settings);
  }

  function buildPromptFromState() {
    if (!state.analysis) {
      throw new Error("Run analysis first.");
    }
    state.settings = settingsFromUi();
    const promptBuilder = window.DPEPromptBuilder;
    if (!promptBuilder || typeof promptBuilder.buildPrompt !== "function") {
      throw new Error("Prompt builder is not available.");
    }
    state.prompt = promptBuilder.buildPrompt(state.analysis, state.settings);
    ui.promptOutput.value = state.prompt;
    return state.prompt;
  }

  async function copyPrompt() {
    const text = ui.promptOutput.value.trim();
    if (!text) {
      throw new Error("No prompt available to copy.");
    }
    await navigator.clipboard.writeText(text);
  }

  function downloadPrompt() {
    const text = ui.promptOutput.value.trim();
    if (!text) {
      throw new Error("No prompt available to download.");
    }
    const tabUrl = (state.analysis && state.analysis.meta && state.analysis.meta.url) || "webpage";
    const host = tabUrl.replace(/^https?:\/\//i, "").split("/")[0].replace(/[^\w.-]+/g, "_");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const fileName = `design-prompt-${host || "page"}-${stamp}.txt`;
    const blob = new Blob([text], { type: "text/plain" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  async function onAnalyzeClick() {
    setButtonsBusy(true);
    setStatus("Analyzing visible design system...", "warning");
    try {
      await saveSettings();
      const analysis = await analyzeCurrentPage();
      const elapsed = analysis && analysis.meta ? `${analysis.meta.sampleCount || 0} elements sampled.` : "Done.";
      setStatus(`Analysis succeeded. ${elapsed}`, "success");
    } catch (error) {
      setStatus(`Analysis failed: ${error.message}`, "error");
    } finally {
      setButtonsBusy(false);
    }
  }

  async function onGenerateClick() {
    setButtonsBusy(true);
    try {
      await saveSettings();
      if (!state.analysis) {
        setStatus("No cached analysis found. Running analysis first...", "warning");
        await analyzeCurrentPage();
      }
      const prompt = buildPromptFromState();
      if (!prompt) {
        throw new Error("Prompt generation returned empty output.");
      }
      setStatus("Prompt generated successfully.", "success");
    } catch (error) {
      setStatus(`Prompt generation failed: ${error.message}`, "error");
    } finally {
      setButtonsBusy(false);
    }
  }

  async function onCopyClick() {
    try {
      await copyPrompt();
      setStatus("Prompt copied to clipboard.", "success");
    } catch (error) {
      setStatus(`Copy failed: ${error.message}`, "error");
    }
  }

  function onDownloadClick() {
    try {
      downloadPrompt();
      setStatus("Prompt .txt downloaded.", "success");
    } catch (error) {
      setStatus(`Download failed: ${error.message}`, "error");
    }
  }

  function setupListeners() {
    ui.analyzeBtn.addEventListener("click", onAnalyzeClick);
    ui.generateBtn.addEventListener("click", onGenerateClick);
    ui.copyBtn.addEventListener("click", onCopyClick);
    ui.downloadBtn.addEventListener("click", onDownloadClick);

    [
      ui.includeColors,
      ui.includeTypography,
      ui.includeLayout,
      ui.includeComponents,
      ui.includeResponsive,
      ui.outputStyle
    ].forEach((el) => {
      el.addEventListener("change", async () => {
        try {
          await saveSettings();
          setStatus("Settings saved.", "idle");
        } catch (error) {
          setStatus(`Could not save settings: ${error.message}`, "error");
        }
      });
    });
  }

  (async function init() {
    try {
      await loadSettings();
      setupListeners();
      setStatus("Ready.", "idle");
    } catch (error) {
      setStatus(`Initialization failed: ${error.message}`, "error");
    }
  })();
})();
