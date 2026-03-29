# Architecture

## Polylith Structure

Browser Bridge follows the [Polylith](https://polylith.gitbook.io/) architecture pattern, adapted for a PureScript/WASM/JS stack. The workspace contains three categories of bricks:

| Category | Path | Purpose |
|---|---|---|
| **Components** | `components/bb/{name}/` | Reusable libraries, each with a single responsibility |
| **Bases** | `bases/bb/cli/` | Entry points that compose components into runnable programs |
| **Projects** | `projects/browser-bridge/` | Published packages (npm library) |

Each component is an independent spago package with its own `spago.yaml` declaring dependencies. Components depend on each other through PureScript package names, not filesystem paths. The root `spago.yaml` ties everything together under the `browser-bridge` workspace package using the PureScript registry 73.3.0.

The `projects/browser-bridge/src/BrowserBridge.purs` module re-exports the public API from all components. This is the single entry point for consumers of the library.

## Component Dependency Graph

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
- **server** depends on protocol. It uses `protocol` types for message routing but not serialization or token-parsing.
- **extension-client** depends on protocol. It wraps Chrome Extension APIs and token storage.
- **interceptor** depends on token-parsing for extracting auth tokens from intercepted requests.
- **token-parsing** and **serialization** are leaf components. They wrap WASM exports and depend on nothing else in the workspace.

## WASM Hot Paths

The Rust crate at `wasm/browser-bridge-wasm/` compiles to WASM and exposes two modules:

### token_parsing.rs

Regex-based token extraction, compiled to native-speed WASM. Exported functions:

| Function | Input | Output | Purpose |
|---|---|---|---|
| `extract_bearer_token` | `&str` header | `Option<String>` | Extracts token from `Bearer ...` authorization headers |
| `extract_sapisidhash` | `&str` header | `Option<String>` | Extracts SAPISIDHASH auth header (Google auth) |
| `extract_xoxc_token` | `&str` body | `Option<String>` | Extracts Slack `xoxc-*` or `xox*-*` tokens from request bodies |
| `detect_platform` | `&str` hostname | `String` | Maps hostname to platform name (gmail, outlook, slack, unknown) |

Uses `LazyLock<Regex>` for compiled regex patterns. No heap allocation on the happy path beyond the returned `String`.

### serialization.rs

Protobuf binary serialization via `prost`. The canonical schema lives at `proto/messages.proto`. Exported functions:

| Function | Input | Output | Purpose |
|---|---|---|---|
| `serialize_message` | `(type_name, json_string)` | `Vec<u8>` | Serializes a JSON message to tagged protobuf bytes |
| `deserialize_message` | `&[u8]` | `String` (JSON) | Deserializes tagged protobuf bytes back to JSON |

The crate is compiled with `opt-level = "z"` and LTO for minimal WASM size. Total target is under 50KB for token parsing alone.

## FFI Layer

The FFI layer is intentionally thin. It contains zero business logic and serves only as bindings between PureScript and external APIs.

### PureScript FFI (foreign imports)

Each component that touches the outside world uses `foreign import` declarations in `.purs` files paired with companion `.js` files:

- **Server.WebSocket** calls Bun's native `WebSocketServer` API. The companion JS creates a Bun HTTP server, upgrades connections, and wraps the Bun-specific API into the generic `ConnectionConfig` record expected by PureScript.
- **Server.Router** uses FFI helpers for `Map` operations, `setTimeout`/`clearTimeout`, and JSON parse/stringify. These delegate to JavaScript's built-in APIs.
- **ExtensionClient.Chrome** wraps `chrome.runtime.sendMessage`, `chrome.scripting.executeScript`, `chrome.cookies.get`, and standard WebSocket. Promise-returning APIs use `Control.Promise.toAffE` to convert to PureScript `Aff`.
- **TokenParsing.FFI** and **Serialization.FFI** load the WASM module and call exported functions, converting between PureScript types and WASM-compatible types (`Uint8Array`, `String`).

### Vanilla JS IIFE (ffi/ directory)

Two standalone IIFE scripts live outside the PureScript build pipeline:

- **`ffi/interceptor.js`**: Runs in the MAIN world. Patches `XMLHttpRequest.prototype.open/send/setRequestHeader` and `window.fetch` to intercept auth headers and request bodies. Extracts tokens using inline regex (no WASM, no imports allowed in MAIN world). Dispatches `CustomEvent("__KB_TOKEN__")` on `window`.
- **`ffi/bridge.js`**: Runs in the ISOLATED world. Listens for `__KB_TOKEN__` events and forwards them via `chrome.runtime.sendMessage`. Also handles Slack cookie extraction via `chrome.cookies.get`.

Both files are bundled with esbuild into `dist/` as self-contained IIFEs with no external imports.

## Two-World Content Script Architecture

Chrome Extensions have two content script execution worlds, and Browser Bridge exploits both:

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

**Flow:**

1. `bridge.js` (ISOLATED world) loads first and dispatches `__KB_BRIDGE_READY__` on `window`.
2. `interceptor.js` (MAIN world) loads second, sees the ready event, and starts intercepting.
3. When an intercepted request contains an auth token, the interceptor dispatches `__KB_TOKEN__` with a detail object containing `platform`, `tokenType`, `token`, `url`, and `timestamp`.
4. `bridge.js` catches the event and calls `chrome.runtime.sendMessage` to forward the token to the background service worker.
5. If the bridge is not yet ready when a token is found, the interceptor buffers tokens and flushes them once the ready event fires.

This design is necessary because MAIN-world scripts cannot access `chrome.*` APIs, and ISOLATED-world scripts cannot patch `XMLHttpRequest` or `window.fetch` in the page context.

## Wire Format

Messages between the server and the Chrome Extension use a tagged protobuf binary format. Each frame consists of a 1-byte type tag followed by the protobuf-encoded message body.

| Tag | Value | Proto Message | Direction |
|---|---|---|---|
| `BrowserRequest` | `0x01` | `BrowserRequest` | Server to Extension |
| `ExtensionMessage` | `0x02` | `ExtensionMessage` | Extension to Server |
| `TokenMessage` | `0x03` | `TokenMessage` | Extension to Server |

### Message Schemas

**BrowserRequest** (server requests an action from the extension):

```
message BrowserRequest {
  string id      = 1;   // Correlation ID
  string action  = 2;   // Action name (e.g. "evaluate", "click")
  bytes payload  = 3;   // JSON payload encoded as UTF-8 bytes
}
```

**ExtensionMessage** (extension responds or sends events):

```
message ExtensionMessage {
  oneof variant {
    ResponseMessage  response    = 1;  // Response to a BrowserRequest
    KeepaliveMessage keepalive   = 2;  // Heartbeat (empty message)
    HotReloadMessage hot_reload  = 3;  // File change notification
    NewEmailMessage  new_email   = 4;  // New email detected
  }
}
```

**TokenMessage** (captured auth token):

```
message TokenMessage {
  string        platform   = 1;  // "gmail", "outlook", "slack", "unknown"
  string        token_type = 2;  // "Bearer", "SAPISIDHASH", "xoxc", "xoxd"
  string        token      = 3;  // The actual token value
  optional string url       = 4;  // URL where token was captured
  uint64        timestamp  = 5;  // Unix timestamp in milliseconds
}
```

The WASM serialization module accepts JSON strings and returns `Vec<u8>` (via `Uint8Array` in JS), and vice versa. The PureScript wrapper functions convert between PureScript's `BrowserRequest`/`ExtensionMessage`/`TokenMessage` records and the JSON strings expected by WASM.
