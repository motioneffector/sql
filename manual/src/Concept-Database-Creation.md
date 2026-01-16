# Database Creation

Every interaction with @motioneffector/sql starts with `createDatabase()`. This async factory function initializes the SQL.js WebAssembly engine, optionally loads existing data, and returns a ready-to-use Database instance.

## How It Works

When you call `createDatabase()`, several things happen:

1. SQL.js downloads and compiles the SQLite WASM binary (cached after first load)
2. A new in-memory SQLite database is created
3. If `persist` is configured, existing data is loaded from storage
4. If `data` is provided, the database is initialized from that Uint8Array
5. Foreign key enforcement is enabled
6. The Database instance is returned

The entire process is async because WASM loading requires a network request (or cache hit). This typically takes 50-200ms on first load, near-instant afterward.

## Basic Usage

```typescript
import { createDatabase } from '@motioneffector/sql'

// Empty database
const db = await createDatabase()

// With persistence
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})

// From existing data
const db = await createDatabase({
  data: existingUint8Array
})
```

## Key Points

- **Always async** - `createDatabase()` returns `Promise<Database>`, so you must `await` it
- **Memory-first** - The database lives in memory; persistence is opt-in
- **One instance per database** - Each call creates a new, independent database
- **Don't forget to close** - Call `db.close()` when done to free memory

## Examples

### Persistent Database

Keep data between page reloads using IndexedDB:

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase({
  persist: {
    key: 'my-app-db',
    storage: 'indexeddb'
  }
})

// Data automatically loads on creation
// Changes automatically save (debounced)
```

### Loading from Backup

Restore a database from an exported file:

```typescript
import { createDatabase } from '@motioneffector/sql'

// User uploads a .sqlite file
const file = await fileInput.files[0].arrayBuffer()
const data = new Uint8Array(file)

const db = await createDatabase({ data })
```

### Custom WASM Path

Host the SQL.js WASM file yourself instead of using the CDN:

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase({
  wasmPath: '/assets/sql-wasm.wasm'
})
```

## Related

- **[Your First Database](Your-First-Database)** - Step-by-step getting started guide
- **[Persistence](Concept-Persistence)** - How auto-save and storage backends work
- **[createDatabase API](API-CreateDatabase)** - Complete options reference
