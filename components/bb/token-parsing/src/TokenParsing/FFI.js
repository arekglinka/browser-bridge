"use strict";

import __wbg_init from "../../../../wasm/browser-bridge-wasm/pkg/browser_bridge_wasm.js";
import { extract_bearer_token, extract_sapisidhash, extract_xoxc_token, detect_platform } from "../../../../wasm/browser-bridge-wasm/pkg/browser_bridge_wasm.js";

export function _wasmInit() {
  return function () {
    return __wbg_init();
  };
}

export function extractBearerToken(header) {
  return function () {
    var result = extract_bearer_token(header);
    return result === undefined ? null : result;
  };
}

export function extractSapisidhash(header) {
  return function () {
    var result = extract_sapisidhash(header);
    return result === undefined ? null : result;
  };
}

export function extractXoxcToken(body) {
  return function () {
    var result = extract_xoxc_token(body);
    return result === undefined ? null : result;
  };
}

export function detectPlatform(hostname) {
  return function () {
    return detect_platform(hostname);
  };
}
