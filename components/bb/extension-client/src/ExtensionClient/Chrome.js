"use strict";

export function connectWebSocket(url) {
  return function() {
    return new WebSocket(url);
  };
}

export function wsSend(ws) {
  return function(data) {
    return function() {
      ws.send(data);
    };
  };
}

export function wsIsOpen(ws) {
  return function() {
    return ws.readyState === WebSocket.OPEN;
  };
}

export function wsOnMessage(ws) {
  return function(callback) {
    return function() {
      ws.onmessage = function(event) {
        callback(event.data)();
      };
    };
  };
}

export function wsOnClose(ws) {
  return function(callback) {
    return function() {
      ws.onclose = function(event) {
        callback(event.code)();
      };
    };
  };
}

export function wsClose(ws) {
  return function() {
    ws.close();
  };
}

export function runtimeSendMessageImpl(message) {
  return function() {
    return chrome.runtime.sendMessage(message);
  };
}

export function runtimeOnMessageAddListener(callback) {
  return function() {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      var sendResponsePS = function(response) {
        return function() {
          sendResponse(response);
          return {};
        };
      };
      return callback(message)(sender)(sendResponsePS)();
    });
  };
}

export function runtimeGetURL(path) {
  return function() {
    return chrome.runtime.getURL(path);
  };
}

export function scriptingExecuteScriptImpl(config) {
  return function() {
    return chrome.scripting.executeScript(config);
  };
}

export function cookiesGetImpl(details) {
  return function() {
    return chrome.cookies.get(details);
  };
}
