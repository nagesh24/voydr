console.log("Voydr cinematic dashboard initialized");

/* --- STATE MANAGEMENT --- */
const state = {
  today: "",
  screenTime: {},
  siteCategory: {},
  blockedSites: [],
  rawBlockedSites: {},
  isExtension: false,
  isDirect: false,
  isBridge: false
};

// CATEGORY DEFINITIONS
const CATEGORY_STYLES = {
  productive: { color: "var(--mint-green)", class: "val-productive", label: "Productive" },
  neutral: { color: "var(--text-secondary)", class: "val-neutral", label: "Neutral" },
  distracting: { color: "var(--burnt-coral)", class: "val-distracting", label: "Distracting" }
};

/* --- DOM REFERENCES --- */
const elements = {
  showcaseIndicator: document.getElementById("showcase-indicator"),
  navActionBtn: document.getElementById("nav-action-btn"),
  heroAddBtn: document.getElementById("hero-add-chrome-btn"),
  footerAddBtn: document.getElementById("footer-add-chrome-btn"),
  scorePercent: document.getElementById("score-percent-val"),
  scoreRing: document.getElementById("score-gauge-ring"),
  focusMsg: document.getElementById("focus-message-txt"),
  statsTotalTime: document.getElementById("stats-total-time"),
  statsProdTime: document.getElementById("stats-prod-time"),
  statsDistTime: document.getElementById("stats-dist-time"),
  barProdPct: document.getElementById("bar-prod-pct"),
  barDistPct: document.getElementById("bar-dist-pct"),
  topSitesFeed: document.getElementById("top-sites-feed"),
  blockInput: document.getElementById("block-domain-input"),
  blockSubmitBtn: document.getElementById("block-submit-btn"),
  blockedTagsContainer: document.getElementById("blocked-badges-container"),
  weeklyTodayBar: document.getElementById("weekly-today-bar"),
  simulatedBlockModal: document.getElementById("simulated-block-modal-screen"),
  simulatedBlockDomain: document.getElementById("simulated-block-domain-name"),
  simulatedBlockCloseBtn: document.getElementById("simulated-block-close-btn")
};

/* --- INITIALIZATION --- */
document.addEventListener("DOMContentLoaded", async () => {
  state.today = getTodayDate();
  
  // 1. ENVIRONMENT DETECTION
  // Check A: Are we directly inside the extension tab/options page?
  state.isDirect = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  
  if (state.isDirect) {
    state.isExtension = true;
    setupExtensionMode();
  } else {
    // Check B: Are we a standard webpage with the extension injected?
    setupBridgeMode();
  }
  
  // 2. SETUP SHARED CONTROLLERS
  setupSharedControllers();
  
  // 3. SETUP 3D LAPTOP TILT PARALLAX
  setup3DLaptopParallax();
});

/* --- DUAL-MODE CONTROLLERS --- */

// --- MODE A: DIRECT LIVE EXTENSION MODE ---
async function setupExtensionMode() {
  console.log("⚡ Direct Extension context detected. Syncing local storage...");
  
  if (elements.showcaseIndicator) elements.showcaseIndicator.style.display = "none";
  setCtasActive();
  
  await loadRealData();
  
  // Dynamic watcher: if storage changes in the background, redraw instantly!
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.screenTime || changes.siteCategory || changes.blockedSites)) {
      console.log("🔄 Direct storage updated. Redrawing...");
      loadRealData();
    }
  });
}

async function loadRealData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["screenTime", "siteCategory", "blockedSites"], (result) => {
      const todayData = result.screenTime?.[state.today] || {};
      
      state.screenTime = {};
      Object.entries(todayData).forEach(([host, sec]) => {
        if (Number.isFinite(sec) && sec > 0) {
          state.screenTime[host] = sec;
        }
      });
      
      state.siteCategory = result.siteCategory || {};
      state.blockedSites = result.blockedSites?.[state.today] || [];
      state.rawBlockedSites = result.blockedSites || {};
      
      renderAll();
      resolve();
    });
  });
}

// --- MODE B: MESSAGING BRIDGE DETECTION (Web Page Mode) ---
function setupBridgeMode() {
  console.log("📡 Standard webpage context. Detecting Extension Bridge...");
  
  let receivedPong = false;
  
  // Listen for bridge messages
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    
    // 1. Response: Extension is installed and active
    if (msg.type === "VOYDR_PONG") {
      receivedPong = true;
      state.isExtension = true;
      state.isBridge = true;
      console.log("✨ Voydr extension detected via bridge! Upgrading dashboard...");
      
      if (elements.showcaseIndicator) elements.showcaseIndicator.style.display = "none";
      setCtasActive();
      
      // Request active database
      window.postMessage({ type: "VOYDR_GET_DATA" }, "*");
    }
    
    // 2. Response: Incoming active database streaming
    if (msg.type === "VOYDR_DATA_RESPONSE") {
      const result = msg.data || {};
      const todayData = result.screenTime?.[state.today] || {};
      
      state.screenTime = {};
      Object.entries(todayData).forEach(([host, sec]) => {
        if (Number.isFinite(sec) && sec > 0) {
          state.screenTime[host] = sec;
        }
      });
      
      state.siteCategory = result.siteCategory || {};
      state.blockedSites = result.blockedSites?.[state.today] || [];
      state.rawBlockedSites = result.blockedSites || {};
      
      renderAll();
    }

    // 3. Response: Confirms that data has been successfully saved to chrome.storage
    if (msg.type === "VOYDR_SAVE_RESPONSE") {
      console.log("💾 Storage synchronized successfully. Refreshing view...");
      window.postMessage({ type: "VOYDR_GET_DATA" }, "*");
    }
  });
  
  // Send ping out to the injected content script
  window.postMessage({ type: "VOYDR_PING" }, "*");
  
  // Timeout: If no response in 180ms, fall back to simulated Showcase Mode
  setTimeout(() => {
    if (!receivedPong) {
      setupShowcaseMode();
    }
  }, 180);
}

// Helper: Styling buttons when Voydr is active
function setCtasActive() {
  const activeMessage = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    Voydr Active & Protecting Focus
  `;
  
  if (elements.navActionBtn) {
    elements.navActionBtn.innerHTML = "Voydr Options";
    elements.navActionBtn.className = "btn btn-secondary";
    elements.navActionBtn.addEventListener("click", () => {
      if (state.isDirect) {
        window.location.reload();
      } else {
        window.postMessage({ type: "VOYDR_OPEN_OPTIONS" }, "*");
      }
    });
  }
  if (elements.heroAddBtn) {
    elements.heroAddBtn.innerHTML = activeMessage;
    elements.heroAddBtn.className = "btn btn-secondary";
    elements.heroAddBtn.style.color = "var(--mint-green)";
    elements.heroAddBtn.style.borderColor = "rgba(127, 200, 169, 0.2)";
    elements.heroAddBtn.disabled = true;
  }
  if (elements.footerAddBtn) {
    elements.footerAddBtn.innerHTML = activeMessage;
    elements.footerAddBtn.className = "btn btn-secondary";
    elements.footerAddBtn.style.color = "var(--mint-green)";
    elements.footerAddBtn.style.borderColor = "rgba(127, 200, 169, 0.2)";
    elements.footerAddBtn.disabled = true;
  }
}

// --- MODE C: INTERACTIVE SHOWCASE MODE (Extension Absent) ---
function setupShowcaseMode() {
  console.log("🎨 Standalone mode loaded. Rendering demo simulation...");
  
  if (elements.showcaseIndicator) {
    elements.showcaseIndicator.style.display = "flex";
    
    // Add helpful integration tip for local file URL loading
    if (window.location.protocol === "file:") {
      const textNode = elements.showcaseIndicator.querySelector(".showcase-banner-text p");
      if (textNode) {
        textNode.innerHTML = `
          The Chrome extension is not detected. We've enabled a fully interactive simulation below!<br/>
          <strong style="color: var(--mint-green); display: block; margin-top: 8px; font-weight: 600;">
            💡 Tip: If you have loaded the unpacked extension in Chrome, enable "Allow access to file URLs" on the Voydr details page in <span style="text-decoration: underline; cursor: pointer;" onclick="alert('Open chrome://extensions, find Voydr, click Details, and enable \\'Allow access to file URLs\\'.')">chrome://extensions</span> to sync your live tracking data here!
          </strong>
        `;
      }
    }
  }
  
  // Load mock demo database
  state.screenTime = {
    "github.com": 8200,
    "youtube.com": 4800,
    "stackoverflow.com": 3100,
    "twitter.com": 2900,
    "notion.so": 1800,
    "spotify.com": 900
  };
  
  state.siteCategory = {
    "github.com": "productive",
    "youtube.com": "distracting",
    "stackoverflow.com": "productive",
    "twitter.com": "distracting",
    "notion.so": "neutral",
    "spotify.com": "neutral"
  };
  
  state.blockedSites = ["facebook.com", "instagram.com"];
  state.rawBlockedSites = {};
  
  const triggerInstallMsg = () => {
    alert("Voydr Extension Installer Triggered!\n\nIn production, this initiates a click-to-install from the Chrome Web Store. Once added, the extension auto-injects its coaching core, and this page will instantly transition into your live focus dashboard!");
  };
  
  if (elements.navActionBtn) elements.navActionBtn.addEventListener("click", triggerInstallMsg);
  if (elements.heroAddBtn) elements.heroAddBtn.addEventListener("click", triggerInstallMsg);
  if (elements.footerAddBtn) elements.footerAddBtn.addEventListener("click", triggerInstallMsg);
  
  renderAll();
}

/* --- SHARED EVENT HANDLERS --- */
function setupSharedControllers() {
  // Block Submission Form
  if (elements.blockSubmitBtn && elements.blockInput) {
    const handleBlock = async () => {
      const inputVal = elements.blockInput.value.trim();
      const domain = cleanInputHostname(inputVal);
      if (!domain) {
        alert("Please enter a valid website domain name (e.g. reddit.com)");
        return;
      }
      
      if (state.blockedSites.includes(domain)) {
        alert(`${domain} is already shielded.`);
        return;
      }
      
      state.blockedSites.push(domain);
      elements.blockInput.value = "";
      
      if (state.isDirect) {
        // Save to real chrome storage
        chrome.storage.local.get(["blockedSites"], (result) => {
          const stored = result.blockedSites || {};
          stored[state.today] = state.blockedSites;
          chrome.storage.local.set({ blockedSites: stored }, () => {
            renderAll();
          });
        });
      } else if (state.isBridge) {
        // Save via messaging bridge
        const stored = state.rawBlockedSites || {};
        stored[state.today] = state.blockedSites;
        window.postMessage({ type: "VOYDR_SAVE_DATA", key: "blockedSites", value: stored }, "*");
      } else {
        // In Showcase, show calming simulation popup modal
        if (elements.simulatedBlockDomain) elements.simulatedBlockDomain.textContent = domain;
        if (elements.simulatedBlockModal) elements.simulatedBlockModal.style.display = "flex";
        renderAll();
      }
    };
    
    elements.blockSubmitBtn.addEventListener("click", handleBlock);
    elements.blockInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleBlock();
    });
  }
  
  // Close simulated block modal
  if (elements.simulatedBlockCloseBtn && elements.simulatedBlockModal) {
    elements.simulatedBlockCloseBtn.addEventListener("click", () => {
      elements.simulatedBlockModal.style.display = "none";
    });
  }
}

/* --- CORE RENDERING ENGINE --- */
function renderAll() {
  // 1. Calculate stats & focus score
  const entries = Object.entries(state.screenTime);
  const totalSeconds = entries.reduce((sum, [, sec]) => sum + sec, 0);
  
  const score = calculateFocusScore(entries, state.siteCategory);
  
  // 2. Render Focus Score circle gauge
  renderFocusGauge(score);
  
  // 3. Render Active Time Breakdown
  renderOverviewStats(totalSeconds, entries);
  
  // 4. Render Intelligence Feed (Top Sites)
  renderTopSites(entries);
  
  // 5. Render Calming Block Shield tags
  renderBlockedTags();
  
  // 6. Render habit index bar chart
  renderWeeklyChart(score);
}

// 2. Focus score circular gauge rendering
function renderFocusGauge(score) {
  if (!elements.scorePercent || !elements.scoreRing || !elements.focusMsg) return;
  
  // Animate text percent from 0 to score
  animateNumber(elements.scorePercent, parseInt(elements.scorePercent.textContent) || 0, score, "%");
  
  // Circle circumference is 2 * PI * r = 2 * 3.14159 * 80 ≈ 502
  const maxStroke = 502;
  const offset = maxStroke * (1 - score / 100);
  
  // Set stroke progress
  elements.scoreRing.style.strokeDashoffset = offset;
  
  // Dynamically change color scheme of progress bar based on performance
  let color = "var(--slate-blue)";
  if (score >= 70) {
    color = "var(--mint-green)";
  } else if (score < 40 && score > 0) {
    color = "var(--burnt-coral)";
  }
  elements.scoreRing.style.stroke = color;
  elements.scoreRing.style.filter = `drop-shadow(0 0 10px ${color})`;
  
  // Focus coaching message
  elements.focusMsg.textContent = getFocusMessage(score);
}

// 3. Overview stats numbers and micro-bars
function renderOverviewStats(totalSeconds, entries) {
  if (!elements.statsTotalTime || !elements.statsProdTime || !elements.statsDistTime || !elements.barProdPct || !elements.barDistPct) return;
  
  elements.statsTotalTime.textContent = formatDuration(totalSeconds);
  
  const productiveSec = entries.reduce((sum, [host, sec]) => {
    return state.siteCategory[host] === "productive" ? sum + sec : sum;
  }, 0);
  
  const distractingSec = entries.reduce((sum, [host, sec]) => {
    return state.siteCategory[host] === "distracting" ? sum + sec : sum;
  }, 0);
  
  elements.statsProdTime.textContent = formatDuration(productiveSec);
  elements.statsDistTime.textContent = formatDuration(distractingSec);
  
  const prodPct = totalSeconds > 0 ? (productiveSec / totalSeconds) * 100 : 0;
  const distPct = totalSeconds > 0 ? (distractingSec / totalSeconds) * 100 : 0;
  
  elements.barProdPct.style.width = `${prodPct}%`;
  elements.barDistPct.style.width = `${distPct}%`;
}

// 4. Site list table + category selector
function renderTopSites(entries) {
  if (!elements.topSitesFeed) return;
  
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  elements.topSitesFeed.innerHTML = "";
  
  if (sorted.length === 0) {
    elements.topSitesFeed.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-secondary); font-size: 0.95rem;">
        No active browser history tracked today. Start exploring to capture intelligence!
      </div>
    `;
    return;
  }
  
  sorted.forEach(([host, sec], idx) => {
    const activeCategory = state.siteCategory[host] || "neutral";
    const activeStyle = CATEGORY_STYLES[activeCategory];
    
    const row = document.createElement("div");
    row.className = "site-row";
    
    // index label
    const idxSpan = document.createElement("span");
    idxSpan.className = "site-index";
    idxSpan.textContent = idx + 1;
    
    // site metadata container
    const infoDiv = document.createElement("div");
    infoDiv.className = "site-info";
    
    const domainRow = document.createElement("div");
    domainRow.className = "site-domain-row";
    
    const domainSpan = document.createElement("span");
    domainSpan.className = "site-domain";
    domainSpan.textContent = host;
    domainRow.appendChild(domainSpan);
    
    const durationSpan = document.createElement("span");
    durationSpan.className = "site-duration";
    durationSpan.textContent = formatDuration(sec);
    
    infoDiv.append(domainRow, durationSpan);
    
    // actions container
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "site-actions";
    
    // dropdown category select
    const select = document.createElement("select");
    select.className = `badge-selector ${activeStyle.class}`;
    select.innerHTML = `
      <option value="productive" ${activeCategory === "productive" ? "selected" : ""}>Productive</option>
      <option value="neutral" ${activeCategory === "neutral" ? "selected" : ""}>Neutral</option>
      <option value="distracting" ${activeCategory === "distracting" ? "selected" : ""}>Distracting</option>
    `;
    
    select.addEventListener("change", (e) => {
      const newCat = e.target.value;
      state.siteCategory[host] = newCat;
      
      if (state.isDirect) {
        chrome.storage.local.set({ siteCategory: state.siteCategory }, () => {
          renderAll();
        });
      } else if (state.isBridge) {
        window.postMessage({ type: "VOYDR_SAVE_DATA", key: "siteCategory", value: state.siteCategory }, "*");
      } else {
        renderAll();
      }
    });
    
    actionsDiv.appendChild(select);
    
    row.append(idxSpan, infoDiv, actionsDiv);
    elements.topSitesFeed.appendChild(row);
  });
}

// 5. Calm blockers badge cloud rendering
function renderBlockedTags() {
  if (!elements.blockedTagsContainer) return;
  
  elements.blockedTagsContainer.innerHTML = "";
  
  if (state.blockedSites.length === 0) {
    elements.blockedTagsContainer.innerHTML = `
      <span style="font-size: 0.85rem; color: var(--text-tertiary);">No sites currently shielded.</span>
    `;
    return;
  }
  
  state.blockedSites.forEach((domain) => {
    const tag = document.createElement("span");
    tag.className = "blocked-tag";
    tag.innerHTML = `
      🚫 ${domain}
      <button class="remove-block-btn" data-domain="${domain}">×</button>
    `;
    
    tag.querySelector("button").addEventListener("click", () => {
      state.blockedSites = state.blockedSites.filter((d) => d !== domain);
      
      if (state.isDirect) {
        chrome.storage.local.get(["blockedSites"], (result) => {
          const stored = result.blockedSites || {};
          stored[state.today] = state.blockedSites;
          chrome.storage.local.set({ blockedSites: stored }, () => {
            renderAll();
          });
        });
      } else if (state.isBridge) {
        const stored = state.rawBlockedSites || {};
        stored[state.today] = state.blockedSites;
        window.postMessage({ type: "VOYDR_SAVE_DATA", key: "blockedSites", value: stored }, "*");
      } else {
        renderAll();
      }
    });
    
    elements.blockedTagsContainer.appendChild(tag);
  });
}

// 6. SVG weekly bar chart updates
function renderWeeklyChart(todayScore) {
  if (!elements.weeklyTodayBar) return;
  
  elements.weeklyTodayBar.style.height = `${todayScore}%`;
  elements.weeklyTodayBar.setAttribute("data-tooltip", `Today: ${todayScore}% Focus score`);
  
  if (todayScore >= 70) {
    elements.weeklyTodayBar.className = "chart-bar bar-high";
  } else if (todayScore < 40 && todayScore > 0) {
    elements.weeklyTodayBar.className = "chart-bar";
    elements.weeklyTodayBar.style.background = "var(--burnt-coral)";
    elements.weeklyTodayBar.style.borderColor = "rgba(217, 123, 102, 0.4)";
  } else {
    elements.weeklyTodayBar.className = "chart-bar";
    elements.weeklyTodayBar.style.background = ""; // Falls back to slate blue
    elements.weeklyTodayBar.style.borderColor = "";
  }
}

/* --- MATH & TEXT UTILITY FUNCTIONS --- */

function calculateFocusScore(entries, categories) {
  const total = entries.reduce((sum, [, sec]) => sum + sec, 0);
  if (total === 0) return 0;
  
  const productive = entries.reduce((sum, [host, sec]) => {
    return categories[host] === "productive" ? sum + sec : sum;
  }, 0);
  
  return Math.round((productive / total) * 100);
}

function getFocusMessage(score) {
  if (score === 0) return "Begin tracking to score your focus.";
  if (score >= 70) return "Excellent deep focus alignment. 🌱 Keep it up!";
  if (score >= 40) return "Moderate productivity today. 🧠 Small adjustment will lift you.";
  return "High distractions detected. 🧘 Time to pause and refocus.";
}

function formatDuration(totalSeconds) {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  
  if (totalSeconds < 3600) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function getTodayDate() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function cleanInputHostname(input) {
  let urlStr = input.trim().toLowerCase();
  if (!urlStr) return "";
  
  if (!urlStr.includes("://")) {
    urlStr = "https://" + urlStr;
  }
  
  try {
    let hostname = new URL(urlStr).hostname;
    if (hostname.startsWith("www.")) {
      hostname = hostname.substring(4);
    }
    return hostname;
  } catch {
    return urlStr.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
  }
}

// Animate numbers smoothly
function animateNumber(element, start, end, suffix = "") {
  if (start === end) {
    element.textContent = `${end}${suffix}`;
    return;
  }
  
  const duration = 800; // ms
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // EaseOutCubic curve
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentVal = Math.round(start + (end - start) * easeProgress);
    
    element.textContent = `${currentVal}${suffix}`;
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = `${end}${suffix}`;
    }
  }
  
  requestAnimationFrame(update);
}

/* --- 3D LAPTOP TILT PARALLAX SYSTEM --- */
function setup3DLaptopParallax() {
  const viewport = document.querySelector('.laptop-viewport');
  const laptop = document.querySelector('#hero-laptop');
  if (!viewport || !laptop) return;

  let requestID = null;
  
  viewport.addEventListener('mousemove', (e) => {
    if (requestID) cancelAnimationFrame(requestID);
    
    requestID = requestAnimationFrame(() => {
      const rect = viewport.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      // Resting position: rotateX(12deg) rotateY(-18deg)
      // Tilt ranges: X axis (12 ± 15deg), Y axis (-18 ± 18deg)
      const tiltX = 12 - (y / rect.height) * 30; 
      const tiltY = -18 + (x / rect.width) * 36;
      
      // Temporarily disable the drift animation so mouse movement feels highly responsive
      laptop.style.animation = 'none';
      laptop.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.04, 1.04, 1.04)`;
    });
  });
  
  viewport.addEventListener('mouseleave', () => {
    if (requestID) cancelAnimationFrame(requestID);
    
    // Smoothly spring back to baseline and reactivate floating drift animation
    laptop.style.transform = 'rotateX(12deg) rotateY(-18deg) scale3d(1, 1, 1)';
    
    setTimeout(() => {
      laptop.style.animation = 'laptop-drift 5s infinite alternate ease-in-out';
    }, 600);
  });
}

/* --- FAQ ACCORDION LOGIC --- */
document.addEventListener("DOMContentLoaded", () => {
  const accordionHeaders = document.querySelectorAll(".accordion-header");
  
  accordionHeaders.forEach(header => {
    header.addEventListener("click", () => {
      const content = header.nextElementSibling;
      const icon = header.querySelector(".accordion-icon");
      const isActive = header.classList.contains("active");

      // Close all accordions first (optional, for accordion effect)
      document.querySelectorAll(".accordion-header").forEach(h => {
        h.classList.remove("active");
        h.nextElementSibling.style.maxHeight = "0";
        const icn = h.querySelector(".accordion-icon");
        if (icn) icn.style.transform = "rotate(0deg)";
      });

      // If it wasn't active, open it
      if (!isActive) {
        header.classList.add("active");
        content.style.maxHeight = content.scrollHeight + "px";
        if (icon) icon.style.transform = "rotate(180deg)";
      }
    });
  });
});

/* --- HEADER SCROLL LOGIC --- */
document.addEventListener("scroll", () => {
  const header = document.getElementById("main-header");
  if (header) {
    if (window.scrollY > 50) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  }
});
