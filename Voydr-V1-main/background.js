console.log("Voydr background loaded");

const REMINDER_THRESHOLD = 30;

let activeHostname = null;
let lastTimestamp = null;
let isWindowFocused = true;

function extractHostname(url) {
	try {
		if (
			!url ||
			url.startsWith("chrome://") ||
			url.startsWith("edge://") ||
			url.startsWith("about:") ||
			url.startsWith("devtools://")
		) {
			return null;
		}

		const hostname = new URL(url).hostname;
		if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
			return null;
		}

		return hostname;
	} catch {
		return null;
	}
}

function getTodayDate() {
	const now = new Date();
	return now.toISOString().split("T")[0];
}

async function checkReminder(hostname, totalSeconds) {
	if (totalSeconds < REMINDER_THRESHOLD) {
		return;
	}

	try {
		const today = getTodayDate();
		const { remindersSent: storedRemindersSent } = await chrome.storage.local.get(["remindersSent"]);
		const remindersSent =
			storedRemindersSent && typeof storedRemindersSent === "object" && !Array.isArray(storedRemindersSent)
				? storedRemindersSent
				: {};

		if (!remindersSent[today] || typeof remindersSent[today] !== "object" || Array.isArray(remindersSent[today])) {
			remindersSent[today] = {};
		}

		if (remindersSent[today][hostname]) {
			return;
		}

		chrome.notifications.create(
			{
				type: "basic",
				iconUrl: chrome.runtime.getURL("icons/icon48.png"),
				title: "Voydr Reminder",
				message: `You've quota for using ${hostname} for today is over. Stay intentional.`,
				priority: 2,
			},
			(notificationId) => {
				if (chrome.runtime.lastError) {
					console.error("Notification Error:", chrome.runtime.lastError);
				} else {
					console.log("[REMINDER SENT]", hostname);
				}
			}
		);

		remindersSent[today][hostname] = true;
		await chrome.storage.local.set({ remindersSent });
	} catch (error) {
		console.error("[Reminder Error]", error);
	}
}

async function saveTime(hostname, secondsToAdd) {
	try {
		const { screenTime: storedScreenTime } = await chrome.storage.local.get(["screenTime"]);
		const screenTime = storedScreenTime || {};
		const today = getTodayDate();

		if (!screenTime[today]) {
			screenTime[today] = {};
		}

		if (!screenTime[today][hostname]) {
			screenTime[today][hostname] = 0;
		}

		screenTime[today][hostname] += secondsToAdd;
		const updatedTotalForToday = screenTime[today][hostname];
		await chrome.storage.local.set({ screenTime });
		await checkReminder(hostname, updatedTotalForToday);
		console.log(`[SAVED] ${hostname} total updated`);
	} catch (error) {
		console.error("[Save Error]", error);
	}
}

function trackTime() {
	if (!activeHostname || !isWindowFocused || !lastTimestamp) {
		return;
	}

	const now = Date.now();
	let deltaSeconds = Math.floor((now - lastTimestamp) / 1000);

	if (deltaSeconds <= 0) {
		return;
	}

	if (deltaSeconds > 300) {
		console.log("[CAPPED DELTA]", deltaSeconds, "→ 300");
		deltaSeconds = 300;
	}

	lastTimestamp = now;
	void saveTime(activeHostname, deltaSeconds);
}

function cleanInputHostname(input) {
	let urlString = input.trim().toLowerCase();
	if (!urlString) return "";

	if (!urlString.includes("://")) {
		urlString = "https://" + urlString;
	}

	try {
		let hostname = new URL(urlString).hostname;
		if (hostname.startsWith("www.")) {
			hostname = hostname.substring(4);
		}
		return hostname;
	} catch {
		return urlString.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
	}
}

async function checkBlock(tabId, url) {
	if (!url) return false;
	const hostname = extractHostname(url);
	if (!hostname) return false;

	try {
		const { blockedSites } = await chrome.storage.local.get(["blockedSites"]);
		const today = getTodayDate();
		const todayBlocked = blockedSites?.[today] || [];
		
		const activeClean = cleanInputHostname(hostname);
		const isBlocked = todayBlocked.some(blocked => {
			const blockedClean = cleanInputHostname(blocked);
			return activeClean === blockedClean || activeClean.endsWith("." + blockedClean);
		});

		if (isBlocked) {
			const blockedUrl = chrome.runtime.getURL(`blocked.html?site=${hostname}`);
			await chrome.tabs.update(tabId, { url: blockedUrl });
			return true;
		}
	} catch (err) {
		console.error("Block check error", err);
	}
	return false;
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
	try {
		const tab = await chrome.tabs.get(tabId);
		
		const isBlocked = await checkBlock(tabId, tab?.url);
		if (isBlocked) return;

		const hostname = extractHostname(tab?.url);
		if (!hostname) {
			return;
		}

		trackTime();
		activeHostname = hostname;
		lastTimestamp = Date.now();
		console.log("[Activated]", activeHostname);
	} catch (error) {
		console.error("[Activated Error]", error);
	}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.url) {
		const isBlocked = await checkBlock(tabId, changeInfo.url);
		if (isBlocked) return;
	}

	if (changeInfo.status === "complete" && tab?.active === true) {
		const hostname = extractHostname(tab?.url);
		if (!hostname) {
			return;
		}

		trackTime();
		activeHostname = hostname;
		lastTimestamp = Date.now();
		console.log("[Updated]", activeHostname);
	}
});

chrome.windows.onFocusChanged.addListener((windowId) => {
	if (windowId === chrome.windows.WINDOW_ID_NONE) {
		trackTime();
		isWindowFocused = false;
		console.log("[Window Blur]");
		return;
	}

	isWindowFocused = true;
	lastTimestamp = Date.now();
	console.log("[Window Focus]");
});

chrome.runtime.onSuspend.addListener(() => {
	trackTime();
	console.log("[Service Worker Suspended]");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "getData") {
		chrome.storage.local.get(["screenTime", "siteCategory", "blockedSites"], (result) => {
			sendResponse(result);
		});
		return true; // Keep channel open for async response
	}

	if (message.action === "saveData") {
		const update = {};
		update[message.key] = message.value;
		chrome.storage.local.set(update, () => {
			sendResponse({ success: true });
		});
		return true;
	}

	if (message.action === "openOptions") {
		chrome.runtime.openOptionsPage(() => {
			sendResponse?.({ success: true });
		});
		return true;
	}
});
