"use strict";

export function ffiEmptyMap() {
  return function () {
    return {};
  };
}

export function ffiMapSet(map) {
  return function (key) {
    return function (value) {
      return function () {
        map[key] = value;
      };
    };
  };
}

export function ffiMapGet(map) {
  return function (key) {
    return function () {
      if (key in map) {
        return map[key];
      }
      return null;
    };
  };
}

export function ffiMapDelete(map) {
  return function (key) {
    return function () {
      delete map[key];
    };
  };
}

export function ffiMapValues(map) {
  return function () {
    return Object.values(map);
  };
}

export function ffiMapClear(map) {
  return function () {
    for (var key in map) {
      if (map.hasOwnProperty(key)) {
        delete map[key];
      }
    }
  };
}

export function ffiMakePendingEntry(callback) {
  return function (timer) {
    return function () {
      return { callback: callback, timer: timer };
    };
  };
}

export function ffiGetTimer(entry) {
  return function () {
    return entry.timer;
  };
}

export function ffiResolve(entry) {
  return function (value) {
    return function () {
      entry.callback({ tag: "Right", field0: value })();
    };
  };
}

export function ffiReject(entry) {
  return function (err) {
    return function () {
      entry.callback({ tag: "Left", field0: err })();
    };
  };
}

export function generateId() {
  return function () {
    return crypto.randomUUID();
  };
}

export function setTimeout_(ms) {
  return function (fn) {
    return function () {
      return setTimeout(function () { fn(undefined); }, ms);
    };
  };
}

export function clearTimeout_(timer) {
  return function () {
    clearTimeout(timer);
  };
}

export function jsonParse(str) {
  return function () {
    return JSON.parse(str);
  };
}

export function foreignGetProperty(key) {
  return function (obj) {
    return function () {
      return obj[key];
    };
  };
}

export function foreignToString(val) {
  return function () {
    return String(val);
  };
}

export function buildRequestJson(id) {
  return function (action) {
    return function (payload) {
      return function () {
        return JSON.stringify({ id: id, action: action, payload: payload });
      };
    };
  };
}

export function ffiError(msg) {
  return function () {
    return new Error(msg);
  };
}

export function ffiForEach(arr) {
  return function (fn) {
    return function () {
      arr.forEach(function (x) { fn(x)(); });
    };
  };
}

export function isExtensionConnected(server) {
  return function () {
    return server._connections.size > 0;
  };
}
