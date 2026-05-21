console.log("Voydr content script bridge active");

// 1. Listen for window messages sent by the landing page/website
window.addEventListener("message", (event) => {
  // Only accept messages from ourselves (the window)
  if (event.source !== window) return;

  const message = event.data;
  if (!message || typeof message !== "object") return;

  // Bridge action: PING -> PONG
  if (message.type === "VOYDR_PING") {
    try {
      window.postMessage({ type: "VOYDR_PONG", extensionId: chrome.runtime.id }, "*");
    } catch (e) {
      console.warn("Voydr background connection sleeping.");
    }
  }

  // Bridge action: GET_DATA (Read chrome.storage.local)
  if (message.type === "VOYDR_GET_DATA") {
    chrome.runtime.sendMessage({ action: "getData" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Voydr bridge error getting data:", chrome.runtime.lastError);
        return;
      }
      window.postMessage({ type: "VOYDR_DATA_RESPONSE", data: response }, "*");
    });
  }

  // Bridge action: SAVE_DATA (Write to chrome.storage.local)
  if (message.type === "VOYDR_SAVE_DATA") {
    chrome.runtime.sendMessage({ action: "saveData", key: message.key, value: message.value }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Voydr bridge error saving data:", chrome.runtime.lastError);
        return;
      }
      window.postMessage({ type: "VOYDR_SAVE_RESPONSE", success: true }, "*");
    });
  }

  // Bridge action: OPEN_OPTIONS
  if (message.type === "VOYDR_OPEN_OPTIONS") {
    try {
      chrome.runtime.sendMessage({ action: "openOptions" });
    } catch (e) {
      console.warn("Voydr bridge failed to trigger options page.");
    }
  }
});

// 2. Inject a custom HTML attribute so the landing page can immediately scan for extension existence
document.documentElement.setAttribute("data-voydr-extension-installed", "true");
