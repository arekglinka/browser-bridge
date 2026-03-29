const WS_URL = "ws://localhost:3456";
let ws = null;
let reconnectTimer = null;

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
    console.log("[bridge] server message:", event.data);
  });

  ws.addEventListener("close", () => {
    console.log("[bridge] disconnected, reconnecting in 3s");
    reconnectTimer = setTimeout(connect, 3000);
  });

  ws.addEventListener("error", (event) => {
    console.error("[bridge] error:", event);
  });
}

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
