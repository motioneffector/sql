# @motioneffector/sql

A TypeScript wrapper around SQL.js for browser-based SQLite databases.

## Overview

This library provides a clean, typed interface for working with SQLite databases in the browser using SQL.js (SQLite compiled to WebAssembly). It handles initialization, schema migrations, and common CRUD operations while giving you full SQL access when needed.

## Features

- **Browser SQLite**: Full SQLite database in the browser via WebAssembly
- **Schema Migrations**: Versioned migrations with up/down support
- **Type-Safe Queries**: Generic query methods with TypeScript inference
- **Transaction Support**: Wrap multiple operations in transactions
- **Import/Export**: Save database to file, load from file
- **Persistence**: Optional auto-save to IndexedDB or localStorage
- **Prepared Statements**: Parameterized queries to prevent SQL injection
- **Type Safety**: Full TypeScript support

## Core Concepts

### Database Initialization

```typescript
const db = await createDatabase({
  // Optional: load existing database
  data: existingUint8Array,
  // Optional: persist to IndexedDB
  persist: { key: 'my-app-db', storage: 'indexeddb' }
})
```

### Schema Migrations

Define migrations to evolve your schema over time:

```typescript
const migrations = [
  {
    version: 1,
    up: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )
    `,
    down: `DROP TABLE users`
  },
  {
    version: 2,
    up: `ALTER TABLE users ADD COLUMN created_at TEXT`,
    down: `-- SQLite doesn't support DROP COLUMN easily`
  }
]

await db.migrate(migrations)
```

### Basic Queries

```typescript
// Insert
db.run(
  'INSERT INTO users (name, email) VALUES (?, ?)',
  ['Alice', 'alice@example.com']
)

// Select one
const user = db.get<User>(
  'SELECT * FROM users WHERE id = ?',
  [1]
)

// Select many
const users = db.all<User>(
  'SELECT * FROM users WHERE name LIKE ?',
  ['%ali%']
)

// Update
db.run(
  'UPDATE users SET name = ? WHERE id = ?',
  ['Alicia', 1]
)

// Delete
db.run('DELETE FROM users WHERE id = ?', [1])
```

## API

### `createDatabase(options?)`

Creates and initializes a database.

**Options:**
- `data`: Existing database as Uint8Array (optional)
- `persist`: Persistence config (optional)
  - `key`: Storage key
  - `storage`: `'indexeddb'` or `'localstorage'`

### `db.run(sql, params?)`

Execute a statement (INSERT, UPDATE, DELETE, CREATE, etc.).

**Returns:** `{ changes: number, lastInsertRowId: number }`

### `db.get<T>(sql, params?)`

Execute a query, return first row.

**Returns:** `T | undefined`

### `db.all<T>(sql, params?)`

Execute a query, return all rows.

**Returns:** `T[]`

### `db.exec(sql)`

Execute raw SQL (multiple statements allowed). No return value.

### `db.transaction(fn)`

Execute a function within a transaction. Rolls back on error.

```typescript
await db.transaction(() => {
  db.run('INSERT INTO orders (...) VALUES (...)')
  db.run('UPDATE inventory SET quantity = quantity - 1 WHERE ...')
})
```

### `db.migrate(migrations)`

Run pending migrations.

### `db.export()`

Export database as Uint8Array (for saving to file).

### `db.import(data)`

Replace database contents from Uint8Array.

### `db.save()`

Manually trigger save to persistent storage (if configured).

### `db.close()`

Close the database connection.

## Table Helpers

For common CRUD operations:

```typescript
const users = db.table<User>('users')

// Insert
const id = users.insert({ name: 'Bob', email: 'bob@example.com' })

// Find by ID
const user = users.find(id)

// Find with conditions
const admins = users.where({ role: 'admin' })

// Update
users.update(id, { name: 'Robert' })

// Delete
users.delete(id)

// Count
const count = users.count({ role: 'admin' })
```

## Persistence Options

### IndexedDB (Recommended)

```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})
```
- Larger storage limits
- Async, non-blocking
- Survives browser data clearing better

### localStorage

```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'localstorage' }
})
```
- Simpler but 5-10MB limit
- Synchronous
- Encoded as base64 (size overhead)

### Manual (Export/Import)

```typescript
// Export
const data = db.export()
downloadFile(data, 'backup.db')

// Import
const data = await loadFile()
db.import(data)
```

## Use Cases

- Offline-first web applications
- Browser-based tools with structured data
- Local-first apps with optional sync
- Prototyping with a real database
- Any app needing SQL in the browser

## Design Philosophy

This library aims to make SQLite in the browser feel natural. You get the full power of SQL with a thin TypeScript layer for common operations. No ORM abstractions - just SQL with type safety.

## Note on SQL.js

This library wraps [SQL.js](https://github.com/sql-js/sql.js), which compiles SQLite to WebAssembly. The WASM file (~1MB) needs to be loaded. This library handles that automatically, but you may want to configure the WASM path for production:

```typescript
const db = await createDatabase({
  wasmPath: '/assets/sql-wasm.wasm'
})
```

## Installation

```bash
npm install @motioneffector/sql
```

## License

MIT
