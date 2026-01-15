# Persistence

By default, your database exists only in memory and is lost when the page closes. Persistence saves the database to browser storage so it survives page reloads, browser restarts, and even device reboots.

## How It Works

Configure persistence when creating the database:

```typescript
const db = await createDatabase({
  persist: {
    key: 'my-app-db',    // Storage key
    storage: 'indexeddb'  // 'indexeddb' or 'localstorage'
  }
})
```

With persistence enabled:
1. On creation, existing data is loaded from storage
2. After each mutation, changes are scheduled to save
3. Saves are debounced (default 1000ms) to batch rapid changes
4. The entire database is serialized as a Uint8Array blob

You can also manually control saving and loading with `db.save()` and `db.load()`.

## Basic Usage

```typescript
import { createDatabase } from '@motioneffector/sql'

// Persistent database with IndexedDB
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})

// Make changes - they auto-save
db.run('INSERT INTO notes (text) VALUES (?)', ['Hello world'])

// Data survives page reload
```

## Key Points

- **IndexedDB recommended** - Larger storage limits (~50MB+), async-friendly
- **localStorage for small data** - Limited to ~5MB, simpler but slower for large databases
- **Auto-save is debounced** - Rapid changes batch into fewer writes
- **Manual control available** - Use `db.save()` to force immediate save, `db.load()` to discard changes
- **Graceful degradation** - Storage failures are logged but don't crash your app

## Examples

### Choosing a Storage Backend

IndexedDB for most applications:

```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})
```

localStorage for simple cases or compatibility:

```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'localstorage' }
})
```

### Disabling Auto-Save

Control exactly when data is saved:

```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' },
  autoSave: false
})

// Make many changes...
db.run('INSERT INTO items (name) VALUES (?)', ['One'])
db.run('INSERT INTO items (name) VALUES (?)', ['Two'])

// Save when ready
await db.save()
```

### Adjusting Debounce Timing

Save more or less frequently:

```typescript
// Save quickly (100ms after last change)
const db = await createDatabase({
  persist: { key: 'realtime-app', storage: 'indexeddb' },
  autoSaveDebounce: 100
})

// Save rarely (5 seconds after last change)
const db = await createDatabase({
  persist: { key: 'batch-app', storage: 'indexeddb' },
  autoSaveDebounce: 5000
})
```

### Discarding Changes

Reload from storage to undo in-memory changes:

```typescript
// User made some changes
db.run('DELETE FROM important_data WHERE id = 1')

// User clicks "Cancel"
await db.load() // Reverts to last saved state
```

### Custom Storage Adapter

Implement your own storage backend:

```typescript
import type { StorageAdapter } from '@motioneffector/sql'

const cloudStorage: StorageAdapter = {
  async getItem(key) {
    const response = await fetch(`/api/db/${key}`)
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  },
  async setItem(key, value) {
    await fetch(`/api/db/${key}`, {
      method: 'PUT',
      body: value
    })
  },
  async removeItem(key) {
    await fetch(`/api/db/${key}`, { method: 'DELETE' })
  }
}

const db = await createDatabase({
  persist: { key: 'user-123', storage: cloudStorage }
})
```

## Related

- **[Setting Up Persistence](Guide-Setting-Up-Persistence)** - Step-by-step configuration guide
- **[Export and Import](Guide-Export-And-Import)** - File-based backup alternative
- **[Persistence API](API-Persistence-Methods)** - save() and load() reference
