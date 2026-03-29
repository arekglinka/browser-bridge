"use strict";

import __wbg_init from "../../../../wasm/browser-bridge-wasm/pkg/browser_bridge_wasm.js";
import { serialize_message, deserialize_message } from "../../../../wasm/browser-bridge-wasm/pkg/browser_bridge_wasm.js";

export function _wasmInit() {
  return function () {
    return __wbg_init();
  };
}

export function serializeMessage(msgType) {
  return function (msgJson) {
    return function () {
      return serialize_message(msgType, msgJson);
    };
  };
}

export function deserializeMessage(data) {
  return function () {
    return deserialize_message(data);
  };
}
