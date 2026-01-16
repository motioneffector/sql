# createDatabase API

The entry point for creating a SQLite database in the browser.

---

## `createDatabase()`

Creates and initializes a new SQLite database instance.

**Signature:**

```typescript
function createDatabase(options?: DatabaseOptions): Promise<Database>
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `options` | `DatabaseOptions` | No | Configuration for the database |

**Returns:** `Promise<Database>` — A fully initialized database instance

**Example:**

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

**Throws:**

- `Error` — If WASM file fails to load
- `SqlError` — If provided data is not valid SQLite format
- `Error` — If persist.key is empty string

---

## Types

### `DatabaseOptions`

```typescript
interface DatabaseOptions {
  data?: Uint8Array
  wasmPath?: string
  persist?: PersistConfig
  autoSave?: boolean
  autoSaveDebounce?: number
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `data` | `Uint8Array` | No | Existing database data to load |
| `wasmPath` | `string` | No | Custom path to SQL.js WASM file. Default: CDN |
| `persist` | `PersistConfig` | No | Persistence configuration |
| `autoSave` | `boolean` | No | Enable automatic saves. Default: `true` when persist is set |
| `autoSaveDebounce` | `number` | No | Debounce delay in ms. Default: `1000` |

### `PersistConfig`

```typescript
interface PersistConfig {
  key: string
  storage: 'indexeddb' | 'localstorage' | StorageAdapter
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `key` | `string` | Yes | Storage key for saving/loading |
| `storage` | `'indexeddb' \| 'localstorage' \| StorageAdapter` | Yes | Storage backend |

### `StorageAdapter`

```typescript
interface StorageAdapter {
  getItem(key: string): Promise<Uint8Array | null>
  setItem(key: string, value: Uint8Array): Promise<void>
  removeItem(key: string): Promise<void>
}
```

Implement this interface to create custom storage backends.
