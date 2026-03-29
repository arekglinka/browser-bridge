
## Server Component — Decisions — 2026-03-29

- Pending request map stored as `Ref Foreign` (JS Object) instead of StrMap (not in package set)
- isExtensionConnected takes Server parameter (needs _connections Set from createServer)
- WebSocket.js tracks connections via Set, server.publish() for broadcast (Bun native)
- HotReload uses Bun.watch() instead of node:fs (ES module compatibility)
- All FFI in PS curried form: a -> b -> Effect X = fn(a) { return fn(b) { return function() {...} } }
