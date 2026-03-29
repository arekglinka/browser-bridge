#!/usr/bin/env node
/**
 * CDP-based bridge server for browser-bridge.
 * Connects to a Chrome/Chromium instance via CDP (Chrome DevTools Protocol)
 * and exposes a WebSocket server that bridge-cli.mjs connects to.
 *
 * Replaces the old relay that depended on a Chrome extension (which kept
 * getting killed by MV3 service worker termination).
 *
 * Usage: node relay.mjs [--port 3457]
 *
 * Environment:
 *   CDP_PORT  - Chrome remote debugging port (default: 9223)
 */
"use strict";

import http from "node:http";
import { WebSocketServer } from "ws";

// ── Config ──────────────────────────────────────────────────────────
const RELAY_PORT =
  parseInt(
    process.argv.find((a) => a === "--port")
      ? process.argv[process.argv.indexOf("--port") + 1]
      : ""
  ) || 3457;
const CDP_PORT = parseInt(process.env.CDP_PORT) || 9223;
const CDP_HOST = `http://localhost:${CDP_PORT}`;

// ── CDP connection state ────────────────────────────────────────────
let cdp = null; // WebSocket to Chrome
let cdpMsgId = 0;
const cdpPending = new Map(); // id → { resolve, reject, timeout }
let cdpReconnecting = false;

// ── CLI connection state ────────────────────────────────────────────
const cliClients = new Set();

// ════════════════════════════════════════════════════════════════════
//  CDP helpers
// ════════════════════════════════════════════════════════════════════

/** Send a CDP command and return the result object. */
function cdpSend(method, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!cdp || cdp.readyState !== 1) {
      reject(new Error("CDP not connected"));
      return;
    }
    const id = ++cdpMsgId;
    const timer = setTimeout(() => {
      cdpPending.delete(id);
      reject(new Error(`CDP timeout (${timeoutMs}ms): ${method}`));
    }, timeoutMs);
    cdpPending.set(id, { resolve, reject, timeout: timer });
    cdp.send(JSON.stringify({ id, method, params }));
  });
}

/** Evaluate a JS expression in the page context via CDP Runtime.evaluate. */
async function pageEval(expression, awaitPromise = false, timeoutMs = 15000) {
  const result = await cdpSend(
    "Runtime.evaluate",
    {
      expression,
      returnByValue: true,
      awaitPromise,
    },
    timeoutMs
  );
  if (result.exceptionDetails) {
    const desc =
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      "Unknown error";
    throw new Error(desc);
  }
  return result.result?.value;
}

/** Like pageEval but catches errors and returns { error } instead of throwing. */
async function pageEvalSafe(expression, awaitPromise = false, timeoutMs = 15000) {
  try {
    const value = await pageEval(expression, awaitPromise, timeoutMs);
    return { value };
  } catch (e) {
    return { error: e.message };
  }
}

// ════════════════════════════════════════════════════════════════════
//  CDP target discovery & connection
// ════════════════════════════════════════════════════════════════════

function discoverTarget() {
  return new Promise((resolve, reject) => {
    http
      .get(`${CDP_HOST}/json/list`, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const targets = JSON.parse(body);
            const page = targets.find((t) => t.type === "page");
            if (page?.webSocketDebuggerUrl) {
              resolve(page.webSocketDebuggerUrl);
            } else {
              reject(new Error("No page target found"));
            }
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function connectCDP() {
  return new Promise(async (resolve) => {
    try {
      const wsUrl = await discoverTarget();
      // Import ws dynamically for the CDP connection
      const { default: WebSocket } = await import("ws");
      const ws = new WebSocket(wsUrl);

      ws.on("open", () => {
        log("CDP connected to", wsUrl);
        cdp = ws;
        cdpReconnecting = false;
        resolve(true);
      });

      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        // Handle command responses
        if (msg.id && cdpPending.has(msg.id)) {
          const { resolve: res, reject: rej, timeout } = cdpPending.get(msg.id);
          clearTimeout(timeout);
          cdpPending.delete(msg.id);
          if (msg.error) {
            rej(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            res(msg.result || {});
          }
        }
        // We ignore CDP events for now
      });

      ws.on("close", () => {
        log("CDP connection closed");
        cdp = null;
        // Reject all pending CDP calls
        for (const [id, { reject, timeout }] of cdpPending) {
          clearTimeout(timeout);
          reject(new Error("CDP disconnected"));
        }
        cdpPending.clear();
        scheduleReconnect();
      });

      ws.on("error", (e) => {
        log("CDP error:", e.message);
        cdp = null;
        scheduleReconnect();
      });
    } catch (e) {
      log("CDP discovery failed:", e.message);
      scheduleReconnect();
      resolve(false);
    }
  });
}

function scheduleReconnect() {
  if (cdpReconnecting) return;
  cdpReconnecting = true;
  log("Reconnecting to CDP in 2s...");
  setTimeout(async () => {
    cdpReconnecting = false;
    await connectCDP();
  }, 2000);
}

// ════════════════════════════════════════════════════════════════════
//  Action handlers
// ════════════════════════════════════════════════════════════════════

const handlers = {
  async navigate({ url }) {
    log(`action: navigate url=${url}`);

    if (url.includes("#")) {
      // SPA hash routing: navigate to base URL first, then set hash
      const hashIndex = url.indexOf("#");
      const baseUrl = url.substring(0, hashIndex);
      const hash = url.substring(hashIndex); // includes the #

      // Navigate to base
      await cdpSend("Page.navigate", { url: baseUrl });
      // Wait for page to settle
      await sleep(500);
      // Set the hash
      await pageEval(`window.location.hash = ${JSON.stringify(hash)}`);
      // Wait for SPA to process the route change
      await sleep(500);
    } else {
      await cdpSend("Page.navigate", { url });
      await sleep(500);
    }
    return true;
  },

  async evaluate({ expression }) {
    log(`action: evaluate expression=${expression.substring(0, 80)}...`);
    const { value, error } = await pageEvalSafe(expression);
    if (error) return { error };
    return value;
  },

  async click({ selector, index = 0 }) {
    log(`action: click selector=${selector} index=${index}`);
    const { value, error } = await pageEvalSafe(`
      (() => {
        const els = document.querySelectorAll(${JSON.stringify(selector)});
        if (!els || !els[${index}]) throw new Error("Element not found: " + ${JSON.stringify(selector)} + "[" + ${index} + "]");
        els[${index}].click();
        return true;
      })()
    `);
    if (error) return { error };
    return value;
  },

  async getText({ selector }) {
    const sel = selector || "body";
    log(`action: getText selector=${sel}`);
    const { value, error } = await pageEvalSafe(`
      document.querySelector(${JSON.stringify(sel)})?.innerText ?? null
    `);
    if (error) return { error };
    return value;
  },

  async getHtml({ selector }) {
    const sel = selector || "body";
    log(`action: getHtml selector=${sel}`);
    const { value, error } = await pageEvalSafe(`
      document.querySelector(${JSON.stringify(sel)})?.innerHTML ?? null
    `);
    if (error) return { error };
    return value;
  },

  async getLinks({ selector = "a[href]" }) {
    log(`action: getLinks selector=${selector}`);
    const { value, error } = await pageEvalSafe(`
      JSON.stringify(
        Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(a => ({
          href: a.href,
          text: a.innerText.trim(),
          hash: a.hash || null
        }))
      )
    `);
    if (error) return { error };
    // The value is a JSON string from the page; parse it
    try {
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  },

  async getImages({ selector = "img" }) {
    log(`action: getImages selector=${selector}`);
    const { value, error } = await pageEvalSafe(`
      JSON.stringify(
        Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(img => ({
          src: img.src,
          alt: img.alt || "",
          loaded: img.complete && img.naturalHeight > 0
        }))
      )
    `);
    if (error) return { error };
    try {
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  },

  async querySelectorAll({ selector, attribute }) {
    log(`action: querySelectorAll selector=${selector} attribute=${attribute}`);
    const attrPart = attribute
      ? `el.getAttribute(${JSON.stringify(attribute)})`
      : `el.outerHTML`;
    const { value, error } = await pageEvalSafe(`
      JSON.stringify(
        Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(el => ${attrPart})
      )
    `);
    if (error) return { error };
    try {
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  },

  async waitForSelector({ selector, timeout = 10000 }) {
    log(`action: waitForSelector selector=${selector} timeout=${timeout}`);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const { value } = await pageEvalSafe(
        `document.querySelector(${JSON.stringify(selector)}) !== null`
      );
      if (value) return true;
      await sleep(200);
    }
    return { error: `Timeout waiting for selector: ${selector}` };
  },

  async getUrl() {
    log("action: getUrl");
    const { value, error } = await pageEvalSafe("window.location.href");
    if (error) return { error };
    return value;
  },

  async getTitle() {
    log("action: getTitle");
    const { value, error } = await pageEvalSafe("document.title");
    if (error) return { error };
    return value;
  },

  async screenshot() {
    log("action: screenshot");
    try {
      const result = await cdpSend("Page.captureScreenshot", {
        format: "png",
      });
      return result.data; // base64 PNG
    } catch (e) {
      return { error: e.message };
    }
  },

  async scrollTo({ x = 0, y = 0 }) {
    log(`action: scrollTo x=${x} y=${y}`);
    const { value, error } = await pageEvalSafe(
      `window.scrollTo(${Number(x)}, ${Number(y)}), true`
    );
    if (error) return { error };
    return value;
  },
};

// ════════════════════════════════════════════════════════════════════
//  Message dispatch
// ════════════════════════════════════════════════════════════════════

async function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    log("invalid JSON from client");
    return;
  }

  const { id, action, payload } = msg;
  if (!id || !action) return;

  // Parse payload (it's always JSON.stringify'd by bridge-cli)
  let params = {};
  try {
    params = typeof payload === "string" ? JSON.parse(payload) : payload || {};
  } catch {
    params = {};
  }

  const handler = handlers[action];
  if (!handler) {
    sendResponse(ws, id, { error: `Unknown action: ${action}` });
    return;
  }

  try {
    const result = await handler(params);
    sendResponse(ws, id, result);
  } catch (e) {
    log(`action ${action} failed:`, e.message);
    sendResponse(ws, id, { error: e.message });
  }
}

function sendResponse(ws, id, payload) {
  if (ws.readyState !== 1) return;
  ws.send(
    JSON.stringify({
      type: "response",
      id,
      payload: typeof payload === "object" ? JSON.stringify(payload) : payload,
    })
  );
}

// ════════════════════════════════════════════════════════════════════
//  Utilities
// ════════════════════════════════════════════════════════════════════

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(...args) {
  process.stderr.write(`[relay] ${args.join(" ")}\n`);
}

// ════════════════════════════════════════════════════════════════════
//  Main
// ════════════════════════════════════════════════════════════════════

async function main() {
  // Connect to CDP first
  log(`Connecting to CDP at port ${CDP_PORT}...`);
  const connected = await connectCDP();
  if (!connected) {
    log("Initial CDP connection failed, will retry in background...");
  }

  // Start WebSocket server for bridge-cli clients
  const server = new WebSocketServer({ port: RELAY_PORT });

  server.on("connection", (ws) => {
    cliClients.add(ws);
    log(`client connected (${cliClients.size} total)`);

    ws.on("message", (data) => handleMessage(ws, data));

    ws.on("close", () => {
      cliClients.delete(ws);
      log(`client disconnected (${cliClients.size} remaining)`);
    });

    ws.on("error", (e) => {
      log("client error:", e.message);
    });
  });

  log(`WebSocket server listening on ws://localhost:${RELAY_PORT}`);
  log("Ready for bridge-cli.mjs connections");
}

main().catch((e) => {
  log("Fatal:", e.message);
  process.exit(1);
});
