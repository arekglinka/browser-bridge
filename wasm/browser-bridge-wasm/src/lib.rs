use wasm_bindgen::prelude::wasm_bindgen;

pub mod serialization;
pub mod token_parsing;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}
