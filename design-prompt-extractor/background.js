chrome.runtime.onInstalled.addListener(() => {
  console.log("Design Prompt Extractor installed.");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "DPE_PING") {
    sendResponse({ ok: true, timestamp: Date.now() });
    return true;
  }
  return false;
});
