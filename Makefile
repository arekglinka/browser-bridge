.PHONY: build build-wasm build-ps build-ffi clean

WASM_DIR = wasm/browser-bridge-wasm
WASM_PKG = $(WASM_DIR)/pkg
DIST_DIR = dist

# ── Individual build targets ──────────────────────────────────────

# WASM: compile Rust to WASM via wasm-pack
build-wasm:
	cd $(WASM_DIR) && ~/.cargo/bin/wasm-pack build --target web --out-dir pkg

# PureScript: compile via spago
build-ps:
	npx spago build

# FFI: bundle interceptor.js and bridge.js as IIFE for MAIN world
build-ffi: build-ps
	mkdir -p $(DIST_DIR)
	npx esbuild ffi/interceptor.js --bundle --format=iife --outfile=$(DIST_DIR)/interceptor.js
	npx esbuild ffi/bridge.js --bundle --format=iife --outfile=$(DIST_DIR)/bridge.js
	cp extension/manifest.json extension/background.js $(DIST_DIR)/

# ── Composite / utility targets ──────────────────────────────────

# Full build: WASM → PureScript → FFI bundle
build: build-wasm build-ps build-ffi

# Clean all build artifacts
clean:
	rm -rf output/ $(WASM_PKG)/ $(DIST_DIR)/
