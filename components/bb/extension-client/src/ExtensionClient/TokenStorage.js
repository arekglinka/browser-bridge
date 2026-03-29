export function entryToForeign(entry) {
  var obj = {};
  obj.platform = entry.platform;
  obj.token = entry.token;
  obj.tokenType = entry.tokenType;
  obj.capturedAt = entry.capturedAt;
  if (entry.url && entry.url !== null) {
    obj.url = entry.url;
  }
  if (entry.expiresAt && entry.expiresAt !== null) {
    obj.expiresAt = entry.expiresAt;
  }
  return obj;
}

export function storeTokenImpl(entry) {
  return function() {
    return new Promise(function(resolve, reject) {
      chrome.storage.local.get("auth_tokens", function(data) {
        var tokens = (data && data.auth_tokens) ? data.auth_tokens : {};
        tokens[entry.platform] = entry;
        chrome.storage.local.set({ auth_tokens: tokens }, function() {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    });
  };
}

export function getTokenImpl(platform) {
  return function() {
    return new Promise(function(resolve, reject) {
      chrome.storage.local.get("auth_tokens", function(data) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        var tokens = (data && data.auth_tokens) ? data.auth_tokens : {};
        resolve(tokens[platform] || null);
      });
    });
  };
}

export function getAllTokensImpl() {
  return function() {
    return new Promise(function(resolve, reject) {
      chrome.storage.local.get("auth_tokens", function(data) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        var tokens = (data && data.auth_tokens) ? data.auth_tokens : {};
        resolve(tokens);
      });
    });
  };
}

export function removeTokenImpl(platform) {
  return function() {
    return new Promise(function(resolve, reject) {
      chrome.storage.local.get("auth_tokens", function(data) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        var tokens = (data && data.auth_tokens) ? data.auth_tokens : {};
        delete tokens[platform];
        chrome.storage.local.set({ auth_tokens: tokens }, function() {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    });
  };
}

export function isNull(f) {
  return f === null || f === undefined;
}
