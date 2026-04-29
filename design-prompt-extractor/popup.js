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
    includeScreenshotVisual: true,
    useFullPageStitch: true,
    includePageContentCopy: true,
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
    includeScreenshotVisual: document.getElementById("includeScreenshotVisual"),
    useFullPageStitch: document.getElementById("useFullPageStitch"),
    includePageContentCopy: document.getElementById("includePageContentCopy"),
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

  function syncSettingsUiState() {
    const screenshotEnabled = !!ui.includeScreenshotVisual.checked;
    ui.useFullPageStitch.disabled = !screenshotEnabled;
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

  async function captureScreenshotAnalysis(tab) {
    const screenshotUtils = window.DPEScreenshotUtils;
    if (!screenshotUtils || typeof screenshotUtils.analyzeScreenshotDataUrl !== "function") {
      throw new Error("Screenshot analysis utility is not available.");
    }
    if (!tab || !tab.windowId) {
      throw new Error("Cannot capture screenshot for this tab.");
    }

    const imageDataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(dataUrl);
      });
    });
    if (!imageDataUrl) {
      throw new Error("Screenshot capture returned no image data.");
    }
    return screenshotUtils.analyzeScreenshotDataUrl(imageDataUrl);
  }

  async function sendMessageToTab(tabId, payload) {
    const response = await chrome.tabs.sendMessage(tabId, payload);
    if (!response || response.ok === false) {
      throw new Error((response && response.error) || "Could not communicate with page for capture.");
    }
    return response;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function capturePngDataUrl(windowId) {
    const imageDataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(dataUrl);
      });
    });
    if (!imageDataUrl) {
      throw new Error("Screenshot capture returned no image data.");
    }
    return imageDataUrl;
  }

  async function captureFullPageScreenshotAnalysis(tab) {
    const screenshotUtils = window.DPEScreenshotUtils;
    if (!screenshotUtils || typeof screenshotUtils.stitchAndAnalyzeScreenshots !== "function") {
      throw new Error("Full-page screenshot utility is not available.");
    }
    if (!tab || !tab.id || !tab.windowId) {
      throw new Error("Cannot run full-page capture for this tab.");
    }

    const prepared = await sendMessageToTab(tab.id, {
      type: "PREPARE_FULLPAGE_CAPTURE",
      options: {
        maxShots: 14,
        overlapRatio: 0.16
      }
    });
    const plan = prepared.capturePlan;
    if (!plan || !Array.isArray(plan.offsets) || !plan.offsets.length) {
      throw new Error("Capture plan for full-page screenshot is empty.");
    }

    const shots = [];
    try {
      for (let i = 0; i < plan.offsets.length; i += 1) {
        const offset = plan.offsets[i];
        await sendMessageToTab(tab.id, { type: "SCROLL_TO_CAPTURE_OFFSET", offset });
        await wait(170);
        const dataUrl = await capturePngDataUrl(tab.windowId);
        shots.push({ offset, dataUrl });
      }
    } finally {
      await sendMessageToTab(tab.id, { type: "RESTORE_CAPTURE_SCROLL" }).catch(() => {});
    }

    return screenshotUtils.stitchAndAnalyzeScreenshots(shots, {
      docHeight: plan.docHeight,
      viewportHeight: plan.viewportHeight,
      viewportWidth: plan.viewportWidth,
      devicePixelRatio: plan.devicePixelRatio,
      maxStitchedHeight: 14000,
      maxStitchedWidth: 2000
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

    if (state.settings.includeScreenshotVisual) {
      try {
        let screenshot;
        if (state.settings.useFullPageStitch) {
          try {
            screenshot = await captureFullPageScreenshotAnalysis(tab);
          } catch (fullPageError) {
            screenshot = await captureScreenshotAnalysis(tab);
            screenshot.fallbackFromFullPage = true;
            screenshot.notes = screenshot.notes || [];
            screenshot.notes.unshift(
              `Full-page stitching failed, fallback used: ${
                fullPageError && fullPageError.message ? fullPageError.message : "Unknown full-page error."
              }`
            );
          }
        } else {
          screenshot = await captureScreenshotAnalysis(tab);
        }
        response.analysis.screenshot = screenshot;
      } catch (error) {
        response.analysis.screenshot = {
          available: false,
          error: error && error.message ? error.message : "Screenshot analysis failed."
        };
      }
    } else {
      response.analysis.screenshot = {
        available: false,
        skipped: true,
        reason: "Disabled in settings."
      };
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
      includeScreenshotVisual: ui.includeScreenshotVisual.checked,
      useFullPageStitch: ui.useFullPageStitch.checked,
      includePageContentCopy: ui.includePageContentCopy.checked,
      outputStyle: ui.outputStyle.value
    };
  }

  function applySettingsToUi(settings) {
    ui.includeColors.checked = !!settings.includeColors;
    ui.includeTypography.checked = !!settings.includeTypography;
    ui.includeLayout.checked = !!settings.includeLayout;
    ui.includeComponents.checked = !!settings.includeComponents;
    ui.includeResponsive.checked = !!settings.includeResponsive;
    ui.includeScreenshotVisual.checked = settings.includeScreenshotVisual !== false;
    ui.useFullPageStitch.checked = settings.useFullPageStitch !== false;
    ui.includePageContentCopy.checked = settings.includePageContentCopy !== false;
    ui.outputStyle.value = settings.outputStyle || "detailed";
    syncSettingsUiState();
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
      setStatus("Analyzing DOM and visual screenshot cues...", "warning");
      const analysis = await analyzeCurrentPage();
      const domMsg = analysis && analysis.meta ? `${analysis.meta.sampleCount || 0} elements sampled` : "DOM sampled";
      const shotMsg =
        analysis && analysis.screenshot && analysis.screenshot.available
          ? analysis.screenshot.mode === "full_page_stitched"
            ? `full-page stitched analysis included (${analysis.screenshot.capture.segments} segments)`
            : "screenshot visual analysis included"
          : "screenshot analysis unavailable";
      setStatus(`Analysis succeeded. ${domMsg}; ${shotMsg}.`, "success");
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
      ui.includeScreenshotVisual,
      ui.useFullPageStitch,
      ui.includePageContentCopy,
      ui.outputStyle
    ].forEach((el) => {
      el.addEventListener("change", async () => {
        try {
          syncSettingsUiState();
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
      requestAnimationFrame(() => {
        document.body.classList.add("popup-ready");
      });
      await loadSettings();
      setupListeners();
      setStatus("Ready.", "idle");
    } catch (error) {
      setStatus(`Initialization failed: ${error.message}`, "error");
    }
  })();
})();
