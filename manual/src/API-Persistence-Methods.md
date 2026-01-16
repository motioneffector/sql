# Persistence Methods API

Methods for manual persistence control.

---

## `save()`

Immediately saves the database to persistent storage.

**Signature:**

```typescript
save(): Promise<void>
```

**Returns:** `Promise<void>`

**Example:**

```typescript
// Force immediate save
await db.save()

// Save before closing tab
window.addEventListener('beforeunload', () => {
  db.save() // Fire and forget
})

// Save after critical operation
await db.transaction(() => {
  db.run('INSERT INTO critical_data VALUES (?)', [data])
})
await db.save() // Don't wait for debounce
```

**Behavior:**

- Cancels any pending debounced auto-save
- Serializes entire database to storage
- No-op if persistence not configured

**Throws:**

- Storage-specific errors (quota exceeded, unavailable, etc.)

---

## `load()`

Reloads the database from persistent storage.

**Signature:**

```typescript
load(): Promise<void>
```

**Returns:** `Promise<void>`

**Example:**

```typescript
// Discard in-memory changes
db.run('DELETE FROM important_data')
await db.load() // Reverts to last saved state

// Refresh from storage (e.g., after external update)
await db.load()
const latestData = db.all('SELECT * FROM data')
```

**Behavior:**

- Replaces current database contents with stored version
- No-op if persistence not configured
- No-op if nothing has been saved yet

**Throws:**

- `SqlError` — If stored data is corrupted/invalid
