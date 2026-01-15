# Installation

```bash
npm install @motioneffector/sql
```

## Requirements

- Node.js 18+ or modern browser (ES2022+)
- TypeScript 5.0+ recommended

## Peer Dependencies

This library requires SQL.js:

```bash
npm install sql.js
```

SQL.js provides the WebAssembly-compiled SQLite engine. The library automatically loads the WASM binary from a CDN by default, or you can specify a custom path with the `wasmPath` option.
