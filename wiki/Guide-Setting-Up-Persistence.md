# Setting Up Persistence

Persistence saves your database to browser storage so data survives page reloads. This guide walks through configuration options and common patterns.

## Prerequisites

Before starting, you should:

- [Create a database](Your-First-Database)

## Overview

We'll configure persistence by:

1. Choosing a storage backend
2. Enabling automatic persistence
3. Controlling save timing
4. Handling errors gracefully

## Step 1: Choose a Storage Backend

Two built-in options are available:

**IndexedDB** (recommended for most cases):
```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})
```

**localStorage** (simpler but limited):
```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'localstorage' }
})
```

| Feature | IndexedDB | localStorage |
|---------|-----------|--------------|
| Storage limit | ~50MB+ | ~5MB |
| Performance | Better for large data | Simple and fast for small data |
| Async-friendly | Yes | Blocking but works |
| Browser support | Modern browsers | All browsers |

Use IndexedDB unless you have a specific reason for localStorage.

## Step 2: Enable Automatic Persistence

With `persist` configured, auto-save is enabled by default. Changes save automatically after a debounce period:

```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
  // autoSave: true (default when persist is set)
  // autoSaveDebounce: 1000 (default: 1 second)
})

// Make changes - they auto-save after 1 second of inactivity
db.run('INSERT INTO notes (text) VALUES (?)', ['Hello'])
db.run('INSERT INTO notes (text) VALUES (?)', ['World'])
// Both changes save in a single write
```

## Step 3: Control Save Timing

Adjust the debounce for your use case:

```typescript
// Save quickly (100ms) for real-time feel
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' },
  autoSaveDebounce: 100
})

// Save slowly (5s) to reduce writes
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' },
  autoSaveDebounce: 5000
})

// Disable auto-save for manual control
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' },
  autoSave: false
})

// Manual save when you decide
await db.save()
```

## Step 4: Handle Errors Gracefully

Storage can fail (quota exceeded, private browsing, etc.). The library logs errors but doesn't crash:

```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})

// Auto-save failures are logged to console.error
// Manual save throws so you can handle it:
try {
  await db.save()
} catch (error) {
  console.error('Save failed:', error.message)
  // Show user a warning, suggest data export, etc.
}
```

## Complete Example

A typical app initialization with persistence:

```typescript
import { createDatabase } from '@motioneffector/sql'
import type { Database, Migration } from '@motioneffector/sql'

const migrations: Migration[] = [
  {
    version: 1,
    up: 'CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, created_at TEXT)'
  }
]

async function initApp(): Promise<Database> {
  // Create persistent database
  const db = await createDatabase({
    persist: { key: 'notes-app', storage: 'indexeddb' },
    autoSaveDebounce: 500
  })

  // Run migrations
  await db.migrate(migrations)

  // Data loaded automatically from storage
  const noteCount = db.get<{ count: number }>('SELECT COUNT(*) as count FROM notes')
  console.log(`Loaded ${noteCount?.count ?? 0} notes from storage`)

  return db
}

// Usage
const db = await initApp()

// Add a note - auto-saves after 500ms
db.run('INSERT INTO notes (text, created_at) VALUES (?, ?)', [
  'My first note',
  new Date().toISOString()
])
```

## Variations

### Custom Storage Adapter

Implement `StorageAdapter` to store anywhere:

```typescript
import type { StorageAdapter } from '@motioneffector/sql'

const remoteStorage: StorageAdapter = {
  async getItem(key: string): Promise<Uint8Array | null> {
    const response = await fetch(`/api/storage/${key}`)
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  },

  async setItem(key: string, value: Uint8Array): Promise<void> {
    await fetch(`/api/storage/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: value
    })
  },

  async removeItem(key: string): Promise<void> {
    await fetch(`/api/storage/${key}`, { method: 'DELETE' })
  }
}

const db = await createDatabase({
  persist: { key: 'user-123-db', storage: remoteStorage }
})
```

### Discarding Changes

Reload from storage to undo uncommitted changes:

```typescript
// User makes some edits
db.run('DELETE FROM important_data WHERE id = 1')

// User clicks "Discard Changes"
await db.load()
// Database reverts to last saved state
```

### Multiple Databases

Each database needs a unique key:

```typescript
const userDb = await createDatabase({
  persist: { key: 'user-data', storage: 'indexeddb' }
})

const cacheDb = await createDatabase({
  persist: { key: 'cache-data', storage: 'indexeddb' }
})
```

### Forcing Immediate Save

When auto-save isn't fast enough:

```typescript
// User clicks "Save Now"
await db.save()
console.log('Saved!')

// Before closing tab
window.addEventListener('beforeunload', () => {
  db.save() // Fire and forget
})
```

## Troubleshooting

### Data Not Persisting

**Symptom:** Data gone after page reload.

**Cause:** `persist` option not configured, or storage failed.

**Solution:** Check that `persist` is passed to `createDatabase()`. Check console for storage errors.

### Quota Exceeded

**Symptom:** `QuotaExceededError` in console.

**Cause:** Storage limit reached (~5MB for localStorage).

**Solution:** Switch to IndexedDB, or implement data cleanup logic. Export and clear old data.

### Private Browsing Issues

**Symptom:** Errors about storage being unavailable.

**Cause:** Safari and some browsers restrict storage in private mode.

**Solution:** Catch the error and warn users that data won't persist. Consider offering export as alternative.

## See Also

- **[Persistence Concept](Concept-Persistence)** - How persistence works internally
- **[Export and Import](Guide-Export-And-Import)** - File-based backup alternative
- **[Persistence API](API-Persistence-Methods)** - save() and load() reference
