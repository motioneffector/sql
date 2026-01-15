# Lifecycle Methods API

Methods for database lifecycle management.

---

## `close()`

Closes the database and releases resources.

**Signature:**

```typescript
close(): void
```

**Returns:** `void`

**Example:**

```typescript
const db = await createDatabase()
// ... use the database ...
db.close()

// After close, methods throw
db.run('SELECT 1') // Error: Database is closed
```

**Behavior:**

- Triggers a final save if persistence configured
- Rejects any pending transactions
- Cancels pending auto-save timers
- Releases SQLite memory

**Notes:**

- Safe to call multiple times
- After close, all methods throw "Database is closed"
- For cleanup in tests or when done with database

---

## `clone()`

Creates an independent copy of the database.

**Signature:**

```typescript
clone(): Promise<Database>
```

**Returns:** `Promise<Database>` — A new database with identical data

**Example:**

```typescript
const original = await createDatabase()
original.exec('CREATE TABLE test (id INTEGER)')
original.run('INSERT INTO test VALUES (1)')

const copy = await original.clone()

// Changes to copy don't affect original
copy.run('INSERT INTO test VALUES (2)')

console.log(original.all('SELECT * FROM test').length) // 1
console.log(copy.all('SELECT * FROM test').length)     // 2
```

**Notes:**

- Clone does not inherit persistence settings
- Useful for "what if" scenarios without affecting real data
- Creates via export/import internally

---

## `clear()`

Deletes all data from all tables without dropping them.

**Signature:**

```typescript
clear(): void
```

**Returns:** `void`

**Example:**

```typescript
db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
console.log(db.all('SELECT * FROM users').length) // 1

db.clear()
console.log(db.all('SELECT * FROM users').length) // 0

// Table structure still exists
db.run('INSERT INTO users (name) VALUES (?)', ['Bob']) // Works
```

**Behavior:**

- Runs DELETE FROM on each user table
- Resets AUTOINCREMENT counters
- Preserves table structure
- Triggers auto-save if configured

**Notes:**

- Does not clear `_migrations` table
- Use for testing or "reset to empty" functionality

---

## `destroy()`

Completely removes the database including persistent storage.

**Signature:**

```typescript
destroy(): Promise<void>
```

**Returns:** `Promise<void>`

**Example:**

```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})

// Later, user wants to delete all data
await db.destroy()

// Database is closed and storage is cleared
// Creating with same key starts fresh
const fresh = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})
```

**Behavior:**

- Removes data from persistent storage
- Calls close() internally
- After destroy, the database is unusable

**Notes:**

- Use for "delete my data" functionality
- If no persistence configured, same as close()
