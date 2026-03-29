# Browser Bridge

A standalone library for bidirectional communication between a desktop server and a Chrome Extension. Built with PureScript for business logic, Rust/WASM for performance-critical paths, and vanilla JS only for FFI bindings.

## Architecture

Browser Bridge splits concerns across three layers:

- **PureScript** handles all business logic: message routing, request/response correlation, token storage, and serialization orchestration.
- **Rust/WASM** covers the hot paths: token extraction (regex matching), protobuf binary serialization, and deserialization.
- **Vanilla JS** provides thin FFI bindings to Chrome Extension APIs (`chrome.runtime`, `chrome.scripting`, `chrome.cookies`), Bun's native WebSocket server, and the MAIN-world interceptor IIFE.

The project follows Polylith architecture, where each component is an independently compilable brick with a single responsibility. Components depend on each other through PureScript packages, not filesystem paths.

## Components

| Component | Description |
|---|---|
| **protocol** | PureScript message types matching the protobuf schema. Defines `BrowserRequest`, `ExtensionMessage`, `TokenMessage`, and their variants. Zero runtime dependencies. |
| **server** | Bun WebSocket server with connection management, request routing, pending-request correlation with timeout, and file-watch hot-reload. |
| **extension-client** | Chrome Extension FFI bindings for `chrome.runtime`, `chrome.scripting`, `chrome.cookies`, and standard WebSocket. Includes token storage via `chrome.storage.local`. |
| **interceptor** | XHR and fetch interception logic. The companion `ffi/interceptor.js` IIFE patches `XMLHttpRequest.prototype` and `window.fetch` to capture auth tokens in the page's MAIN world. |
| **token-parsing** | PureScript wrapper around WASM token extraction. Exports `extractBearerToken`, `extractSapisidhash`, `extractXoxcToken`, and `detectPlatform`. |
| **serialization** | PureScript wrapper around WASM protobuf serialization. Accepts JSON, produces binary protobuf with a 1-byte tag prefix, and deserializes back to JSON. |

## Quick Start

### Prerequisites

- Rust 1.70+ with [wasm-pack](https://rustwasm.github.io/wasm-pack/) (`cargo install wasm-pack`)
- Node.js 18+
- [spago](https://github.com/purescript/spago) 0.93+
- [Bun](https://bun.sh/) (runtime for the server and CLI)

### Build

```bash
export PATH="$HOME/.cargo/bin:$PATH"   # Required for wasm-pack
git clone <repo-url> && cd browser-bridge
npm install
make build
```

`make build` runs the full pipeline: compiles Rust to WASM via wasm-pack, compiles PureScript via spago, and bundles the FFI IIFE files with esbuild.

## Project Structure

```
browser-bridge/
├── Makefile                        # Build pipeline (WASM + PureScript + FFI bundle)
├── spago.yaml                      # Root workspace config, registry 73.3.0
├── package.json                    # npm workspaces + build scripts
├── bunfig.toml                     # Bun configuration
├── components/bb/
│   ├── protocol/                   # Message types (pure data, no effects)
│   ├── server/                     # WebSocket server, router, hot-reload
│   ├── extension-client/           # Chrome Extension API FFI + token storage
│   ├── interceptor/                # XHR/fetch interception PureScript logic
│   ├── token-parsing/              # WASM token extraction wrapper
│   └── serialization/              # WASM protobuf serde wrapper
├── bases/bb/cli/                   # CLI entry point for running the server
├── projects/browser-bridge/        # npm library (re-exports all components)
├── wasm/browser-bridge-wasm/       # Rust crate compiled to WASM
│   ├── Cargo.toml                  # wasm-bindgen + prost + regex
│   ├── proto/messages.proto        # Protobuf schema definitions
│   └── src/
│       ├── lib.rs                  # WASM entry point
│       ├── token_parsing.rs        # Token extraction (bearer, sapisidhash, xoxc)
│       └── serialization.rs        # Binary protobuf serialization
├── ffi/
│   ├── interceptor.js              # MAIN world IIFE (patches XHR + fetch)
│   └── bridge.js                   # ISOLATED world IIFE (forwards tokens via chrome.runtime)
├── templates/                      # Chrome Extension manifest template
├── development/                    # Dev tools and utilities
└── test/                           # Component and base tests
```

## Development

```bash
make build        # Full build: WASM + PureScript + FFI bundle
make build-wasm   # Rust WASM module only (wasm-pack)
make build-ps     # PureScript compile (spago build)
make build-ffi    # Bundle FFI IIFEs with esbuild
make clean        # Remove output/, pkg/, dist/
```

During development, edit PureScript sources in `components/`, Rust sources in `wasm/browser-bridge-wasm/src/`, and vanilla JS FFI in `ffi/`. Run `make build` after changes.

### Running the CLI

The CLI base provides a quick way to start the WebSocket server and test the full pipeline:

```bash
make build
bun run output/Cli.Main/index.js --port 3456
```

The server listens for Chrome Extension connections on the specified port and logs all incoming messages.

### Running WASM Tests

```bash
cargo test --manifest-path wasm/browser-bridge-wasm/Cargo.toml
```

This runs the Rust unit tests for token parsing and serialization round-trips.

## Integration

Browser Bridge is designed as a library. Consume it from another project via npm workspaces:

**1. Add to your `package.json` workspaces:**

```json
{
  "workspaces": ["../browser-bridge/projects/browser-bridge"]
}
```

**2. Import in your application:**

```javascript
const { Protocol, Server, ExtensionClient, Serialization } = require("browser-bridge");
```

**3. Copy the FFI IIFE bundles into your extension build:**

The `dist/interceptor.js` and `dist/bridge.js` files need to be registered as content scripts in your extension manifest. The interceptor runs in the MAIN world; the bridge runs in the ISOLATED world. They communicate via `CustomEvent` on `window`.

**4. Load the WASM module:**

The compiled WASM package lives at `wasm/browser-bridge-wasm/pkg/`. Include it in your build and import before any PureScript code that calls serialization or token-parsing functions.
