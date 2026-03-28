use wasm_bindgen::prelude::*;

/// Stub: parse raw text into a list of token strings.
#[wasm_bindgen]
pub fn parse_tokens(_input: &str) -> Vec<JsValue> {
    Vec::new()
}

/// Stub: check whether a token matches a known pattern.
#[wasm_bindgen]
pub fn is_valid_token(_token: &str) -> bool {
    false
}

/// Stub: normalize a token (lowercase, strip diacritics, etc.).
#[wasm_bindgen]
pub fn normalize_token(_token: &str) -> Option<String> {
    None
}
