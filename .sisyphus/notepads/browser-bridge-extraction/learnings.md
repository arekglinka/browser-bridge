
## Protocol Component Creation (2026-03-29)

### PS 0.15.x Prelude does NOT export Maybe
- PureScript 0.15.x trimmed Prelude significantly. `Maybe` is NO LONGER in Prelude.
- Must use `import Data.Maybe (Maybe)` or `import Data.Maybe (Maybe(..))` explicitly.
- Same likely applies to `Either`, `Tuple`, `Unit` — check before assuming.
- The `arrays` package exports `Data.Array` — `Array` itself IS a built-in type (no import needed).

### spago 0.93.x Workspace Monorepo Pattern
- Each sub-component needs its own `spago.yaml` with a `package` section.
- The root `spago.yaml` has both `package` and `workspace` sections.
- There is NO `sources` or `sourceGlobs` field in spago.yaml. Source discovery is automatic via `src/` directories.
- spago scans for `spago.yaml` files recursively to discover workspace packages.

### spago.yaml Package Config Fields
- Valid fields: `name`, `description`, `dependencies`, `build`, `bundle`, `run`, `test`, `publish`
- `sources` is NOT a valid field — will error with "Unknown field(s): sources"

### Pre-existing Issue: `args` package
- `args` was listed as a dependency in the root spago.yaml but does NOT exist in registry 73.3.0.
- Removed it to unblock builds. It was likely from an older package set or a mistaken addition.
- Also removed duplicate `console` entry.

### Build Verification
- `npx spago build -p protocol` builds only the protocol package.
- `npx spago build` builds the full workspace (both browser-bridge and protocol).
- Clean build: `rm -rf output && npx spago build` for reliable verification.

## Server Component — Learnings — 2026-03-29

### PS 0.15.15 FFI Encoding
- Maybe: Nothing = null, Just x = x (no wrapper)
- Either: Left x = {tag: "Left", field0: x}, Right x = {tag: "Right", field0: x}
- Foreign type: import from `Foreign` module (not Data.Foreign)
- Error type: import from `Effect.Exception` (alias as Ex for error fn)
- Canceler: use `nonCanceler` from Effect.Aff for no-op in makeAff
- Control.Aff renamed to Effect.Aff in PS 0.15
- strmap not in registry 73.3.0 — use Foreign (JS Object) for string-keyed maps
- Bun.watch() for file watching (global in Bun, no require needed)
- Bun WebSocket: globalThis.BunWebSocket.server({fetch, websocket}) with fetch-based upgrade

## extension-client component creation (2026-03-29)

- PS 0.15.15 requires ES module `export const` syntax in companion .js files — NOT CommonJS `exports.xxx =`. The compiler rejects CommonJS with `DeprecatedFFICommonJSModule`.
- `Array` is a built-in type in PS 0.15.x — do NOT `import Data.Array (Array)`, it will error with "Cannot import type Array from module Data.Array".
- `Data.Maybe` import is only needed when actually using `Maybe` in type signatures. Re-exporting modules that use `Maybe` don't need the import at the re-export site.
- spago 0.93.x with registry 73.3.0: `aff-promise` provides `Control.Promise.toAffE` and `Promise` type. Must add to spago.yaml dependencies.
- Chrome storage `.get()` and `.set()` use callbacks in MV3, so manual Promise wrapping is needed (unlike `chrome.runtime.sendMessage` which natively returns Promise).
- Pattern for Promise-based FFI: declare `foreign import xxxImpl :: A -> Effect (Promise B)`, then `xxx = toAffE <<< xxxImpl` in PS.

## token-parsing component creation (2026-03-29)

### WASM --target web FFI pattern
- wasm-pack `--target web` produces ESM named exports. Import directly with `import { fn } from "path/to/pkg/module.js"`.
- Default export is the init function (`__wbg_init`) that returns `Promise<InitOutput>`.
- WASM functions that return `string | undefined` in JS → map `undefined` to `null` in FFI JS → PureScript sees `Maybe String` (null=Nothing, string=Just).
- WASM functions are synchronous (just memory access) → use `Effect` not `Aff` in PS types.
- WASM init is async (loads .wasm binary) → wrap with `Control.Promise.toAffE` from `aff-promise`.
- Pattern: `foreign import _wasmInit :: Effect (Promise Unit)` + JS returns the Promise, then `initTokenParsing = toAffE _wasmInit`.

### PS OrphanTypeDeclaration pitfall
- Do NOT put a standalone type signature before a `foreign import` declaration. PS treats the type signature as an orphan declaration.
- `foreign import foo :: Type` already provides the type — no separate signature needed.

### Required imports for Promise/Aff FFI
- `Control.Promise (Promise, toAffE)` — `Promise` is a foreign type, must be imported explicitly.
- `Data.Unit (Unit)` — `Unit` is NOT in Prelude in PS 0.15.x.
- `Data.Maybe (Maybe)` — always explicit.

### Pre-existing build issue
- `extension-client` has `DeprecatedFFICommonJSModule` error — blocks full workspace `npx spago build`. Not caused by token-parsing.
- Individual package builds (`-p token-parsing`, `-p browser-bridge`) succeed cleanly.
