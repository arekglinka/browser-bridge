export const entryToForeign = function(entry) {
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
};

export const storeTokenImpl = function(entry) {
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
};

export const getTokenImpl = function(platform) {
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
};

export const getAllTokensImpl = function() {
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
};

export const removeTokenImpl = function(platform) {
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
};

export const isNull = function(f) {
  return f === null || f === undefined;
};
