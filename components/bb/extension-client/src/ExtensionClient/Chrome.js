"use strict";

export const connectWebSocket = function(url) {
  return function() {
    return new WebSocket(url);
  };
};

export const wsSend = function(ws) {
  return function(data) {
    return function() {
      ws.send(data);
    };
  };
};

export const wsIsOpen = function(ws) {
  return function() {
    return ws.readyState === WebSocket.OPEN;
  };
};

export const wsOnMessage = function(ws) {
  return function(callback) {
    return function() {
      ws.onmessage = function(event) {
        callback(event.data)();
      };
    };
  };
};

export const wsOnClose = function(ws) {
  return function(callback) {
    return function() {
      ws.onclose = function(event) {
        callback(event.code)();
      };
    };
  };
};

export const wsClose = function(ws) {
  return function() {
    ws.close();
  };
};

export const runtimeSendMessageImpl = function(message) {
  return function() {
    return chrome.runtime.sendMessage(message);
  };
};

export const runtimeOnMessageAddListener = function(callback) {
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
};

export const runtimeGetURL = function(path) {
  return function() {
    return chrome.runtime.getURL(path);
  };
};

export const scriptingExecuteScriptImpl = function(config) {
  return function() {
    return chrome.scripting.executeScript(config);
  };
};

export const cookiesGetImpl = function(details) {
  return function() {
    return chrome.cookies.get(details);
  };
};
