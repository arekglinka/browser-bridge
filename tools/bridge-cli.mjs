#!/usr/bin/env node
"use strict";

const WS_URL = process.env.BRIDGE_WS || "ws://localhost:3457";
let ws;
let pending = new Map();
let msgId = 0;

function generateId() {
  return "req_" + (++msgId) + "_" + Date.now();
}

function sendAction(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = generateId();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout (30s) for action: ${action}`));
    }, 30000);
    pending.set(id, { resolve, reject, timeout });
    const msg = JSON.stringify({ id, action, payload: JSON.stringify(payload) });
    ws.send(msg);
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.addEventListener("open", () => {
      console.error("[client] connected to", WS_URL);
      resolve();
    });
    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "response" && msg.id && pending.has(msg.id)) {
          const { resolve, timeout } = pending.get(msg.id);
          clearTimeout(timeout);
          pending.delete(msg.id);
          try {
            resolve(msg.payload ? JSON.parse(msg.payload) : null);
          } catch {
            resolve(msg.payload);
          }
        }
      } catch (e) {
        console.error("[client] parse error:", e.message);
      }
    });
    ws.addEventListener("error", (e) => reject(e));
    ws.addEventListener("close", () => {
      console.error("[client] disconnected");
      process.exit(1);
    });
  });
}

async function evaluate(expr) {
  return sendAction("evaluate", { expression: expr });
}

async function navigate(url) {
  return sendAction("navigate", { url });
}

async function getText(selector = "body") {
  return sendAction("getText", { selector });
}

async function getLinks(selector = "a[href]") {
  return sendAction("getLinks", { selector });
}

async function getImages(selector = "img") {
  return sendAction("getImages", { selector });
}

async function querySelectorAll(selector, attribute = null) {
  return sendAction("querySelectorAll", { selector, attribute });
}

async function click(selector, index = 0) {
  return sendAction("click", { selector, index });
}

async function waitForSelector(selector, timeout = 10000) {
  return sendAction("waitForSelector", { selector, timeout });
}

async function screenshot() {
  return sendAction("screenshot", {});
}

async function getUrl() {
  return sendAction("getUrl");
}

async function scrollTo(y = 0) {
  return sendAction("scrollTo", { x: 0, y });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function extractAllLinks() {
  const links = await getLinks();
  return typeof links === "string" ? JSON.parse(links) : links;
}

async function extractAllImages() {
  const imgs = await getImages();
  return typeof imgs === "string" ? JSON.parse(imgs) : imgs;
}

async function extractPageContent(selector = "body") {
  return await getText(selector);
}

async function extractPageHtml(selector = "body") {
  return await sendAction("getHtml", { selector });
}

export {
  connect, sendAction, evaluate, navigate, getText, getLinks, getImages,
  querySelectorAll, click, waitForSelector, screenshot, getUrl, scrollTo,
  sleep, extractAllLinks, extractAllImages, extractPageContent, extractPageHtml,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);
  (async () => {
    await connect();
    if (!cmd) {
      console.log("Usage: bridge-cli.js <action> [args...]");
      console.log("Actions: navigate, evaluate, getText, getLinks, getImages, click, screenshot, getUrl, waitForSelector, querySelectorAll, scrollTo");
      process.exit(0);
    }
    let result;
    switch (cmd) {
      case "navigate":
        result = await navigate(args[0]);
        break;
      case "evaluate":
        result = await evaluate(args.join(" "));
        break;
      case "getText":
        result = await getText(args[0]);
        break;
      case "getLinks":
        result = await extractAllLinks();
        break;
      case "getImages":
        result = await extractAllImages();
        break;
      case "click":
        result = await click(args[0], parseInt(args[1] || "0"));
        break;
      case "screenshot":
        result = await screenshot();
        break;
      case "getUrl":
        result = await getUrl();
        break;
      case "waitForSelector":
        result = await waitForSelector(args[0], parseInt(args[1] || "10000"));
        break;
      case "querySelectorAll":
        result = await querySelectorAll(args[0], args[1] || null);
        break;
      case "scrollTo":
        result = await scrollTo(parseInt(args[0] || "0"));
        break;
      default:
        console.error("Unknown action:", cmd);
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
    ws.close();
    process.exit(0);
  })();
}
