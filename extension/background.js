const WS_URL = "ws://localhost:3457";
let ws = null;
let reconnectTimer = null;

// ── WebSocket connection ──────────────────────────────────────────

function connect() {
  ws = new WebSocket(WS_URL);

  ws.addEventListener("open", () => {
    console.log("[bridge] connected to", WS_URL);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  ws.addEventListener("message", (event) => {
    handleServerMessage(event.data);
  });

  ws.addEventListener("close", () => {
    console.log("[bridge] disconnected, reconnecting in 3s");
    reconnectTimer = setTimeout(connect, 3000);
  });

  ws.addEventListener("error", (event) => {
    console.error("[bridge] error:", event);
  });
}

function sendResponse(id, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "response", id, payload }));
  }
}

function sendError(id, errorMsg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "response", id, payload: JSON.stringify({ error: errorMsg }) }));
  }
}

// ── Execute script in active tab ──────────────────────────────────

async function executeInTab(func, args = []) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("No active tab found");
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func,
    args,
    world: "MAIN"
  });
  return results?.[0]?.result ?? null;
}

// ── Server message handler ────────────────────────────────────────

async function handleServerMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (e) {
    console.error("[bridge] invalid JSON from server:", raw);
    return;
  }

  // Handle response messages (from server relay)
  if (msg.type === "response") return;
  if (msg.type === "TokenMessage") return;

  // Handle BrowserRequest format: { id, action, payload }
  if (msg.id && msg.action) {
    const { id, action, payload } = msg;
    console.log("[bridge] action:", action, "(id:", id + ")");
    try {
      let result;
      switch (action) {
        case "navigate":
          result = await handleNavigate(payload);
          break;
        case "evaluate":
          result = await handleEvaluate(payload);
          break;
        case "click":
          result = await handleClick(payload);
          break;
        case "getHtml":
          result = await handleGetHtml(payload);
          break;
        case "getText":
          result = await handleGetText(payload);
          break;
        case "screenshot":
          result = await handleScreenshot(payload);
          break;
        case "waitForSelector":
          result = await handleWaitForSelector(payload);
          break;
        case "getUrl":
          result = await handleGetUrl();
          break;
        case "getTitle":
          result = await handleGetTitle();
          break;
        case "getLinks":
          result = await handleGetLinks(payload);
          break;
        case "getImages":
          result = await handleGetImages(payload);
          break;
        case "querySelectorAll":
          result = await handleQuerySelectorAll(payload);
          break;
        case "scrollTo":
          result = await handleScrollTo(payload);
          break;
        default:
          sendError(id, "Unknown action: " + action);
          return;
      }
      sendResponse(id, typeof result === "string" ? result : JSON.stringify(result));
    } catch (e) {
      console.error("[bridge] action error:", action, e.message);
      sendError(id, e.message);
    }
  }
}

// ── Action handlers ───────────────────────────────────────────────

async function handleNavigate(payload) {
  const { url } = JSON.parse(payload);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("No active tab");
  await chrome.tabs.update(tab.id, { url });
  // Wait for the page to load
  await new Promise((resolve) => {
    const listener = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Timeout fallback
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
  return JSON.stringify({ url: tab.url, status: "loaded" });
}

async function handleEvaluate(payload) {
  const { expression } = JSON.parse(payload);
  return await executeInTab((expr) => {
    return String(eval(expr));
  }, [expression]);
}

async function handleClick(payload) {
  const { selector, index = 0 } = JSON.parse(payload);
  return await executeInTab((sel, idx) => {
    const els = document.querySelectorAll(sel);
    if (idx < els.length) {
      els[idx].click();
      return JSON.stringify({ clicked: true, selector: sel, index: idx, total: els.length });
    }
    return JSON.stringify({ clicked: false, error: "index out of range", total: els.length });
  }, [selector, index]);
}

async function handleGetHtml(payload) {
  const { selector } = JSON.parse(payload);
  return await executeInTab((sel) => {
    if (!sel || sel === "body") return document.body.innerHTML;
    const el = document.querySelector(sel);
    return el ? el.innerHTML : null;
  }, [selector || null]);
}

async function handleGetText(payload) {
  const { selector } = JSON.parse(payload);
  return await executeInTab((sel) => {
    if (!sel || sel === "body") return document.body.innerText;
    const el = document.querySelector(sel);
    return el ? el.innerText : null;
  }, [selector || null]);
}

async function handleScreenshot(payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("No active tab");
  // Need host permissions for captureVisibleTab — check manifest
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    // Return base64 without the data: prefix to save bandwidth
    return dataUrl.replace(/^data:image\/png;base64,/, "");
  } catch (e) {
    // Fallback: use canvas in the page
    return await executeInTab(() => {
      const canvas = document.createElement("canvas");
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawWindow(window, 0, 0, canvas.width, canvas.height, "rgb(255,255,255)");
      return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
    });
  }
}

async function handleWaitForSelector(payload) {
  const { selector, timeout = 10000 } = JSON.parse(payload);
  return await executeInTab((sel, tout) => {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(sel);
      if (el) { resolve(JSON.stringify({ found: true, selector: sel })); return; }
      const observer = new MutationObserver(() => {
        const el = document.querySelector(sel);
        if (el) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(JSON.stringify({ found: true, selector: sel }));
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(JSON.stringify({ found: false, selector: sel }));
      }, tout);
    });
  }, [selector, timeout]);
}

async function handleGetUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || "about:blank";
}

async function handleGetTitle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.title || "";
}

async function handleGetLinks(payload) {
  const { selector = "a[href]" } = JSON.parse(payload);
  return await executeInTab((sel) => {
    const links = Array.from(document.querySelectorAll(sel));
    return JSON.stringify(links.map(a => ({
      href: a.href,
      text: a.textContent.trim().substring(0, 100),
      hash: a.getAttribute("href")
    })));
  }, [selector]);
}

async function handleGetImages(payload) {
  const { selector = "img" } = JSON.parse(payload);
  return await executeInTab((sel) => {
    const imgs = Array.from(document.querySelectorAll(sel));
    return JSON.stringify(imgs.map(img => ({
      src: img.src,
      alt: img.alt,
      width: img.naturalWidth,
      height: img.naturalHeight,
      loaded: img.complete && img.naturalWidth > 0
    })));
  }, [selector]);
}

async function handleQuerySelectorAll(payload) {
  const { selector, attribute = null } = JSON.parse(payload);
  return await executeInTab((sel, attr) => {
    const els = Array.from(document.querySelectorAll(sel));
    if (!attr) {
      return JSON.stringify({ count: els.length, texts: els.map(el => el.textContent.trim().substring(0, 200)) });
    }
    return JSON.stringify(els.map(el => el.getAttribute(attr)));
  }, [selector, attribute]);
}

async function handleScrollTo(payload) {
  const { x = 0, y = 0 } = JSON.parse(payload);
  return await executeInTab((sx, sy) => {
    window.scrollTo(sx, sy);
    return JSON.stringify({ scrolled: true, x: window.scrollX, y: window.scrollY });
  }, [x, y]);
}

// ── Token capture (existing functionality) ──────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TOKEN_CAPTURED") {
    console.log(
      "[bridge] token captured:",
      message.platform,
      "/",
      message.tokenType,
      message.token ? message.token.substring(0, 20) + "..." : "(empty)"
    );

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "TokenMessage",
        platform: message.platform,
        tokenType: message.tokenType,
        token: message.token,
        url: message.url,
        timestamp: message.timestamp
      }));
    }
  }
  return false;
});

connect();
