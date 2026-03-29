# Browser Bridge

Bidirectional communication between a desktop server and a Chrome Extension, built with PureScript for business logic, Rust/WASM for performance-critical paths, and vanilla JS only for FFI bindings.

## Overview

Browser Bridge connects a desktop WebSocket server to a Chrome Extension through a typed, protobuf-backed message protocol. The server sends actions to the extension (evaluate JavaScript, click elements, extract data), and the extension responds with results, heartbeat signals, or captured auth tokens. Everything flows through a single WebSocket connection with request/response correlation and automatic timeouts.

The stack is deliberately narrow: PureScript handles all application logic, Rust compiled to WASM handles the hot paths (regex-based token extraction and protobuf serialization), and vanilla JavaScript provides thin FFI bindings to Chrome Extension APIs and Bun's native WebSocket server. No TypeScript, no bundler frameworks, no transpilation. The JS layer is a handful of IIFE files that either wrap Chrome APIs or run as content scripts.

The project follows Polylith architecture, where each component is an independently compilable brick with a single responsibility and explicit dependency boundaries. A fundamental design pattern is the two-world content script architecture: one script runs in Chrome's MAIN world (to patch `XMLHttpRequest` and `window.fetch` in the page context) while another runs in the ISOLATED world (to access `chrome.*` APIs). They communicate through `CustomEvent` on the shared `window` object. This separation is dictated by Chrome Manifest V3's execution model and cannot be avoided.

## Architecture

Browser Bridge splits concerns across three layers:

- **PureScript** handles all business logic: message routing, request/response correlation, token storage, and serialization orchestration.
- **Rust/WASM** covers the hot paths: token extraction (regex matching), protobuf binary serialization, and deserialization.
- **Vanilla JS** provides thin FFI bindings to Chrome Extension APIs (`chrome.runtime`, `chrome.scripting`, `chrome.cookies`), Bun's native WebSocket server, and the MAIN-world interceptor IIFE.

### Polylith Structure

The workspace follows the Polylith pattern, adapted for a PureScript/WASM/JS stack. Components are reusable bricks, each a standalone spago package with its own `spago.yaml`. Bases are entry points that compose components into runnable programs. Projects are published packages that re-export the public API. Components depend on each other through PureScript package names, not filesystem paths. The root `spago.yaml` ties everything together under the `browser-bridge` workspace package.

### Component Dependency Graph

```
                   protocol
                  /        \
                 v          v
          extension-client  server
                 |          |
                 v          v
             interceptor  (router, hot-reload)
                 |
                 v
          token-parsing  ──→  serialization
                 |                |
                 v                v
            WASM (Rust)     WASM (Rust)
```

Dependencies flow downward. No component reaches upward to depend on a higher-level component.

- **protocol** has zero runtime dependencies. It defines pure data types only.
- **server** depends on protocol. It uses protocol types for message routing but not serialization or token-parsing.
- **extension-client** depends on protocol. It wraps Chrome Extension APIs and token storage.
- **interceptor** depends on token-parsing for extracting auth tokens from intercepted requests.
- **token-parsing** and **serialization** are leaf components. They wrap WASM exports and depend on nothing else in the workspace.

### Two-World Content Script Architecture

Chrome Extensions have two content script execution worlds, and Browser Bridge uses both:

```
  MAIN world (page context)               ISOLATED world (extension context)
  ┌─────────────────────┐                ┌─────────────────────┐
  │  interceptor.js      │                │  bridge.js           │
  │                     │   CustomEvent   │                     │
  │  Patches XHR/fetch  │ ─────────────→ │  Listens for tokens  │
  │  Extracts tokens    │  __KB_TOKEN__   │  chrome.runtime.send │
  │                     │  __KB_BRIDGE_   │                     │
  │  Buffers until      │  READY__ ←──── │  Signals readiness   │
  │  bridge is ready    │                │                     │
  └─────────────────────┘                └─────────────────────┘
                                                   │
                                                   v
                                         ┌─────────────────────┐
                                         │  Background script   │
                                         │  (service worker)    │
                                         │                     │
                                         │  Receives tokens     │
                                         │  Stores in           │
                                         │  chrome.storage      │
                                         │  Sends to server     │
                                         │  via WebSocket       │
                                         └─────────────────────┘
```

The flow works as follows. `bridge.js` (ISOLATED world) loads first and dispatches `__KB_BRIDGE_READY__` on `window`. `interceptor.js` (MAIN world) loads second, sees the ready event, and starts intercepting. When an intercepted request contains an auth token, the interceptor dispatches `__KB_TOKEN__` with a detail object containing `platform`, `tokenType`, `token`, `url`, and `timestamp`. `bridge.js` catches the event and calls `chrome.runtime.sendMessage` to forward the token to the background service worker. If the bridge is not yet ready when a token is found, the interceptor buffers tokens and flushes them once the ready event fires.

This design is necessary because MAIN-world scripts cannot access `chrome.*` APIs, and ISOLATED-world scripts cannot patch `XMLHttpRequest` or `window.fetch` in the page context.

## Components

### protocol

Pure message types matching the protobuf schema. Defines `BrowserRequest`, `ExtensionMessage`, `TokenMessage`, and their variants. Zero runtime dependencies, zero FFI.

| Export | Type | Description |
|---|---|---|
| `BrowserRequest(..)` | `newtype BrowserRequest { id :: String, action :: String, payload :: Maybe String }` | Request from server to extension |
| `ExtensionMessage(..)` | `data ExtensionMessage = Response ResponseMessage \| Keepalive KeepaliveMessage \| HotReload HotReloadMessage \| NewEmail NewEmailMessage \| Unknown String` | Union type from extension to server |
| `ResponseMessage(..)` | `newtype ResponseMessage { id :: String, payload :: Maybe String }` | Response to a BrowserRequest |
| `KeepaliveMessage` | `data KeepaliveMessage` | Heartbeat signal (presence = signal) |
| `HotReloadMessage(..)` | `newtype HotReloadMessage { files :: Array String }` | File change notification |
| `NewEmailMessage(..)` | `newtype NewEmailMessage { email :: Maybe EmailData }` | New email from content script |
| `EmailData(..)` | `newtype EmailData { subject :: Maybe String, sender :: Maybe String, bodyPreview :: Maybe String }` | Extracted email metadata |
| `TokenMessage(..)` | `newtype TokenMessage { platform :: String, tokenType :: String, token :: String, url :: Maybe String, timestamp :: Timestamp }` | Captured auth token |
| `Timestamp(..)` | `newtype Timestamp Int` | Unix-epoch milliseconds (newtype wrapper around Int) |

Use protocol types directly in application code when constructing or pattern-matching messages. All other components that handle messages import their types from here.

### server

Bun WebSocket server with connection management, request routing, pending-request correlation with 30-second timeout, and file-watch hot-reload.

| Export | Type | Description |
|---|---|---|
| `createServer` | `Int -> Effect Server` | Start Bun WebSocket server on given port |
| `onConnection` | `Server -> (ConnectionConfig -> Effect Unit) -> Effect Unit` | Register connection handler |
| `onDisconnection` | `Server -> Effect Unit -> Effect Unit` | Register disconnection handler |
| `onMessage` | `Server -> (String -> Effect Unit) -> Effect Unit` | Register message handler |
| `send` | `Connection -> String -> Effect Unit` | Send string to a specific connection |
| `broadcast` | `Server -> String -> Effect Unit` | Send string to ALL connections |
| `close` | `Connection -> Effect Unit` | Close a connection |
| `closeServer` | `Server -> Effect Unit` | Stop the server |
| `initPendingMap` | `Effect PendingMap` | Create a map for correlating requests with responses |
| `sendToExtension` | `Server -> PendingMap -> String -> Foreign -> Aff Foreign` | Send request, wait for response (30s timeout) |
| `handleIncomingMessage` | `PendingMap -> String -> Effect (Maybe Foreign)` | Process an incoming message, resolve pending if it's a response |
| `rejectAllPending` | `PendingMap -> String -> Effect Unit` | Reject all pending requests with error message |
| `isExtensionConnected` | `Server -> Effect Boolean` | Check if at least one extension is connected |
| `watchDist` | `String -> (Array String -> Effect Unit) -> Effect (Effect Unit)` | Watch directory for file changes, returns cleanup function |

The server wraps Bun's native `WebSocketServer` API through an FFI companion JS file. `sendToExtension` is the primary request/response function: it serializes a `BrowserRequest`, sends it over the wire, and returns an `Aff` that resolves when the matching `ResponseMessage` arrives or rejects after 30 seconds. `watchDist` uses filesystem watching to notify connected extensions of file changes for hot-reload.

### extension-client

Chrome Extension FFI bindings for `chrome.runtime`, `chrome.scripting`, `chrome.cookies`, and standard WebSocket. Includes token storage via `chrome.storage.local`.

| Export | Type | Description |
|---|---|---|
| `connectWebSocket` | `String -> Effect WebSocketClient` | Create standard WebSocket connection |
| `wsSend` | `WebSocketClient -> String -> Effect Unit` | Send via WebSocket |
| `wsIsOpen` | `WebSocketClient -> Effect Boolean` | Check connection state |
| `wsOnMessage` | `WebSocketClient -> (String -> Effect Unit) -> Effect Unit` | Register message handler |
| `wsOnClose` | `WebSocketClient -> (Int -> Effect Unit) -> Effect Unit` | Register close handler |
| `wsClose` | `WebSocketClient -> Effect Unit` | Close WebSocket |
| `runtimeSendMessage` | `Foreign -> Aff Foreign` | Send message via chrome.runtime |
| `runtimeOnMessageAddListener` | `(Foreign -> Foreign -> (Foreign -> Effect Unit) -> Effect Boolean) -> Effect Unit` | Listen for chrome.runtime messages |
| `scriptingExecuteScript` | `Foreign -> Aff (Array Foreign)` | Execute content script via chrome.scripting |
| `cookiesGet` | `Foreign -> Aff (Nullable Foreign)` | Get a cookie via chrome.cookies |
| `runtimeGetURL` | `String -> Effect String` | Get extension URL |
| `storeToken` | `TokenEntry -> Aff Unit` | Store token in chrome.storage.local |
| `getToken` | `String -> Aff (Maybe Foreign)` | Retrieve token by platform |
| `getAllTokens` | `Aff Foreign` | Get all stored tokens |
| `removeToken` | `String -> Aff Unit` | Remove token by platform |

The `TokenEntry` record type:

```purescript
{ platform :: String, token :: String, tokenType :: String
, capturedAt :: String, url :: Maybe String, expiresAt :: Maybe String }
```

Promise-returning Chrome APIs are wrapped with `Control.Promise.toAffE` to produce PureScript `Aff` values. The WebSocket functions mirror the standard `WebSocket` API surface but use a wrapper type to avoid exposing the raw browser object.

### interceptor

XHR and fetch interception logic. The companion `ffi/interceptor.js` IIFE patches `XMLHttpRequest.prototype.open/send/setRequestHeader` and `window.fetch` to capture auth tokens in the page's MAIN world.

| Export | Type | Description |
|---|---|---|
| `extractBearer` | `String -> Maybe String` | PS-native bearer extraction |
| `extractSapisidhash` | `String -> Maybe String` | PS-native SAPISIDHASH extraction |
| `extractXoxc` | `String -> Maybe String` | PS-native XOXC token extraction |
| `detectPlatform` | `String -> String` | PS-native platform detection |
| `buildTokenEvent` | `String -> String -> String -> String -> String` | Build JSON token event detail |

The PureScript module provides pure functions for token extraction, used for testing and reference. In production, the actual interception happens in the `ffi/interceptor.js` IIFE because MAIN-world scripts cannot import WASM or any external modules. The IIFE uses inline regex patterns that mirror the Rust implementations.

### token-parsing

PureScript wrapper around WASM token extraction. The WASM module uses compiled `LazyLock<Regex>` patterns for native-speed matching.

| Export | Type | Description |
|---|---|---|
| `initTokenParsing` | `Aff Unit` | Initialize WASM module (must call first) |
| `extractBearerToken` | `String -> Effect (Maybe String)` | Extract "Bearer ..." token |
| `extractSapisidhash` | `String -> Effect (Maybe String)` | Extract SAPISIDHASH header |
| `extractXoxcToken` | `String -> Effect (Maybe String)` | Extract Slack xoxc/xox tokens |
| `detectPlatform` | `String -> Effect String` | Map hostname to platform name |

Call `initTokenParsing` once at startup before using any extraction function. The function loads the WASM binary and caches the module instance. Extraction functions return `Nothing` when no match is found; `Just token` otherwise.

### serialization

PureScript wrapper around WASM protobuf serialization. Accepts JSON strings, produces binary protobuf with a 1-byte tag prefix, and deserializes back to JSON.

| Export | Type | Description |
|---|---|---|
| `initSerialization` | `Aff Unit` | Initialize WASM module (must call first) |
| `serializeMessage` | `String -> String -> Effect Foreign` | Serialize JSON to tagged protobuf bytes |
| `deserializeMessage` | `Foreign -> Effect String` | Deserialize tagged protobuf bytes to JSON |

Call `initSerialization` once at startup. `serializeMessage` takes a type name (e.g. `"BrowserRequest"`) and a JSON string, and returns a `Uint8Array` (wrapped as `Foreign`) with the 1-byte tag prefix followed by the protobuf body. `deserializeMessage` reverses the process.

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

### Verify

```bash
make build                    # Full build (exit 0)
cargo test --manifest-path wasm/browser-bridge-wasm/Cargo.toml  # 52 tests
node --check ffi/interceptor.js  # Valid JS syntax
node --check ffi/bridge.js     # Valid JS syntax
npx spago build               # 8 packages, 0 errors
```

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

### Running the CLI Server

The CLI starts a Bun WebSocket server. When a Chrome Extension connects, it logs the connection and forwards all incoming messages to the console.

```bash
make build
bun run output/Cli.Main/index.js
```

The server listens on port 3456 by default (configurable with `--port`).

### Testing

```bash
# Rust unit tests (token parsing + serialization round-trips)
cargo test --manifest-path wasm/browser-bridge-wasm/Cargo.toml

# PureScript build verification (no test runner set up yet)
npx spago build
```

### WASM Development

The WASM module must be rebuilt after any changes to `wasm/browser-bridge-wasm/src/`. The output goes to `wasm/browser-bridge-wasm/pkg/` and is imported by the PureScript FFI companions. No rebuild is needed when only PureScript or JS FFI files change.

## Wire Format

Messages between the server and the Chrome Extension use a tagged protobuf binary format. Each frame consists of a 1-byte type tag followed by the protobuf-encoded message body.

| Tag | Value | Proto Message | Direction |
|---|---|---|---|
| `BrowserRequest` | `0x01` | `BrowserRequest` | Server to Extension |
| `ExtensionMessage` | `0x02` | `ExtensionMessage` | Extension to Server |
| `TokenMessage` | `0x03` | `TokenMessage` | Extension to Server |

Serialization and deserialization happen in WASM via `prost`. The PureScript wrapper converts between PureScript records and JSON strings, which the WASM layer then converts to and from protobuf bytes.

### Example Flow

```
Server sends:
  Tag: 0x01
  Body: BrowserRequest { id: "abc", action: "evaluate", payload: "document.title" }

Extension responds:
  Tag: 0x02
  Body: ExtensionMessage { response: ResponseMessage { id: "abc", payload: "My Page" } }
```

The protobuf schemas are defined in `wasm/browser-bridge-wasm/proto/messages.proto`:

```
message BrowserRequest {
  string id      = 1;   // Correlation ID
  string action  = 2;   // Action name (e.g. "evaluate", "click")
  bytes payload  = 3;   // JSON payload encoded as UTF-8 bytes
}

message ExtensionMessage {
  oneof variant {
    ResponseMessage  response    = 1;  // Response to a BrowserRequest
    KeepaliveMessage keepalive   = 2;  // Heartbeat (empty message)
    HotReloadMessage hot_reload  = 3;  // File change notification
    NewEmailMessage  new_email   = 4;  // New email detected
  }
}

message TokenMessage {
  string        platform   = 1;  // "gmail", "outlook", "slack", "unknown"
  string        token_type = 2;  // "Bearer", "SAPISIDHASH", "xoxc", "xoxd"
  string        token      = 3;  // The actual token value
  optional string url       = 4;  // URL where token was captured
  uint64        timestamp  = 5;  // Unix timestamp in milliseconds
}
```

`BrowserRequest` contains a correlation `id`, an `action` name, and an optional JSON `payload`. `ExtensionMessage` uses a `oneof` variant to carry either a response, a keepalive heartbeat, a hot-reload notification, or a new-email event. `TokenMessage` carries a captured auth token with platform, type, value, and capture metadata.

## Integration

Browser Bridge is designed as a library consumed via npm workspaces. Follow these steps to integrate it into an existing Chrome Extension project.

### Step 1: Add npm workspace

Add browser-bridge to your project's workspaces:

```json
{
  "workspaces": ["../browser-bridge"]
}
```

### Step 2: Register content scripts in manifest.json

Reference the template at `templates/manifest.json`. Include both content scripts:

- `interceptor.js` in MAIN world (patches XHR/fetch, extracts tokens)
- `bridge.js` in ISOLATED world (forwards tokens to background)

```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/interceptor.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["<all_urls>"],
      "js": ["dist/bridge.js"],
      "run_at": "document_start",
      "world": "ISOLATED"
    }
  ]
}
```

Both files are bundled by esbuild into `dist/` as self-contained IIFEs with no external imports.

### Step 3: Initialize WASM in your background script

Before using serialization or token-parsing, load the WASM modules:

```javascript
import { initTokenParsing } from "./output/TokenParsing.FFI/index.js";
import { initSerialization } from "./output/Serialization/FFI/index.js";

await initTokenParsing();
await initSerialization();
```

### Step 4: Start the WebSocket server

```javascript
import { createServer, onConnection, onMessage, broadcast } from "./output/Server/index.js";

const server = await createServer(3456);
```

### Step 5: Process token events in your background script

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TOKEN_CAPTURED") {
    console.log(`Token captured: ${message.platform}/${message.tokenType}`);
    // Store or forward to server
  }
});
```

## Design Decisions

| Decision | Rationale |
|---|---|
| PureScript for all logic | Immutable by default, type-safe, no runtime errors when it compiles |
| Rust/WASM for hot paths | Regex and protobuf at native speed; compiled with LTO, under 50KB |
| Vanilla JS only for FFI | No build step for interceptor IIFE; must be IIFE for MAIN world |
| Polylith over monorepo | Each component is independently compilable and testable |
| Bun for server | Native WebSocket API, no npm dependency on ws package |
| Protobuf over JSON for wire format | Binary format is smaller and faster than JSON for high-frequency messages |

## Contributing

PRs welcome. Run `make build` and `cargo test` before submitting.

## License

MIT
