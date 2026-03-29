"use strict";

// FFI for Bun's native WebSocket server via global BunWebSocket.
// Bun uses a fetch-based upgrade pattern instead of the standard ws "connection" event.
// All functions follow standard PS FFI currying: a -> b -> Effect Unit = fn(a) { return fn(b) { return function() { ... } } }

export function createServer(port) {
  return function () {
    var server = Bun.serve({
      hostname: "127.0.0.1",
      port: port,
      WebSocket: WebSocket,
      fetch: function (req, server) {
        if (server.upgrade(req)) {
          return;
        }
        return new Response("WebSocket upgrade failed", { status: 500 });
      },
      websocket: {
        open: function (ws) {
          if (server._psConnectionHandler) {
            var config = {
              connection: ws,
              send: function (data) {
                return function () {
                  ws.send(data);
                };
              },
              close: function () {
                ws.close();
              }
            };
            server._psConnectionHandler(config)();
          }
        },
        message: function (ws, message) {
          if (server._psMessageHandler) {
            server._psMessageHandler(message)();
          }
        },
        close: function (ws, code, message) {
          if (server._psDisconnectionHandler) {
            server._psDisconnectionHandler();
          }
        }
      }
    });

    server._psConnectionHandler = null;
    server._psDisconnectionHandler = null;
    server._psMessageHandler = null;
    server._connections = new Set();

    var originalWebSocket = server.websocket;
    server.websocket = {
      open: function (ws) {
        server._connections.add(ws);
        if (originalWebSocket.open) originalWebSocket.open(ws);
      },
      message: function (ws, message) {
        if (originalWebSocket.message) originalWebSocket.message(ws, message);
      },
      close: function (ws, code, message) {
        server._connections.delete(ws);
        if (originalWebSocket.close) originalWebSocket.close(ws, code, message);
      }
    };

    return server;
  };
}

export function onConnection(server) {
  return function (handler) {
    return function () {
      server._psConnectionHandler = handler;
    };
  };
}

export function onDisconnection(server) {
  return function (handler) {
    return function () {
      server._psDisconnectionHandler = handler;
    };
  };
}

export function onMessage(server) {
  return function (handler) {
    return function () {
      server._psMessageHandler = handler;
    };
  };
}

export function send(connection) {
  return function (data) {
    return function () {
      connection.send(data);
    };
  };
}

export function close(connection) {
  return function () {
    connection.close();
  };
}

export function closeServer(server) {
  return function () {
    server.stop();
  };
}

// Bun WebSocket server.publish sends to all connected clients
export function broadcast(server) {
  return function (data) {
    return function () {
      server.publish(data);
    };
  };
}
