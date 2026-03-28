use wasm_bindgen::prelude::*;

/// Stub: serialize parsed data to protobuf bytes (Vec<u8> exposed as JsValue).
#[wasm_bindgen]
pub fn serialize_to_protobuf(_data: &JsValue) -> Vec<u8> {
    Vec::new()
}

/// Stub: deserialize protobuf bytes back into a JS object.
#[wasm_bindgen]
pub fn deserialize_from_protobuf(_bytes: &[u8]) -> JsValue {
    JsValue::NULL
}

/// Stub: convert a JS object to a JSON string.
#[wasm_bindgen]
pub fn to_json(_data: &JsValue) -> String {
    String::new()
}

/// Stub: parse a JSON string into a JS object.
#[wasm_bindgen]
pub fn from_json(_json_str: &str) -> JsValue {
    JsValue::NULL
}
