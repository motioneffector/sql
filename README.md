# @motioneffector/sql

A lightweight TypeScript wrapper around [SQL.js](https://github.com/sql-js/sql.js) that brings SQLite to the browser with migrations, persistence, and full type safety.

[![npm version](https://img.shields.io/npm/v/@motioneffector/sql.svg)](https://www.npmjs.com/package/@motioneffector/sql)
[![license](https://img.shields.io/npm/l/@motioneffector/sql.svg)](https://github.com/motioneffector/sql/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

## Installation

```bash
npm install @motioneffector/sql sql.js
```

## Quick Start

```typescript
import { createDatabase } from '@motioneffector/sql'

// Create a database
const db = await createDatabase()

// Create a table
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`)

// Insert data
db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])

// Query data
const user = db.get<{ id: number; name: string; email: string }>(
  'SELECT * FROM users WHERE id = ?',
  [1]
)

console.log(user?.name) // "Alice"
```

## Features

- **Browser SQLite** - Full SQLite database in the browser via WebAssembly
- **Schema Migrations** - Versioned migrations with up/down support
- **Type-Safe Queries** - Generic query methods with TypeScript inference
- **Auto-Persistence** - Optional auto-save to IndexedDB or localStorage
- **Transaction Support** - ACID transactions with automatic rollback
- **Import/Export** - Save database to file, load from file
- **Table Helpers** - Convenient CRUD operations for common patterns
- **Zero Dependencies** - Only requires sql.js as a peer dependency
- **Tree-Shakeable** - ESM build with named exports

## API Reference

### `createDatabase(options?)`

Creates and initializes a SQLite database.

**Options:**
- `data` - Existing database as Uint8Array (optional)
- `persist` - Persistence configuration (optional)
  - `key` - Storage key
  - `storage` - `'indexeddb'` | `'localstorage'` | custom StorageAdapter
- `autoSave` - Enable automatic saves after mutations (default: true when persist is set)
- `autoSaveDebounce` - Debounce delay for auto-save in milliseconds (default: 1000)
- `wasmPath` - Path to SQL.js WASM file (optional)

**Returns:** `Promise<Database>`

**Example:**
```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' },
  autoSave: true
})
```

### `db.run(sql, params?)`

Execute a statement (INSERT, UPDATE, DELETE, CREATE, etc.).

**Returns:** `{ changes: number, lastInsertRowId: number }`

**Example:**
```typescript
const result = db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Bob', 'bob@example.com'])
console.log(result.lastInsertRowId) // ID of inserted row
```

### `db.get<T>(sql, params?)`

Execute a query, return first row or undefined.

**Returns:** `T | undefined`

**Example:**
```typescript
const user = db.get<User>('SELECT * FROM users WHERE id = ?', [1])
```

### `db.all<T>(sql, params?)`

Execute a query, return all rows.

**Returns:** `T[]`

**Example:**
```typescript
const users = db.all<User>('SELECT * FROM users WHERE name LIKE ?', ['%alice%'])
```

### `db.exec(sql)`

Execute raw SQL (multiple statements allowed). No return value.

**Example:**
```typescript
db.exec(`
  CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);
  CREATE INDEX idx_posts_title ON posts(title);
`)
```

### `db.transaction(fn)`

Execute a function within a transaction. Automatically rolls back on error.

**Returns:** `Promise<T>`

**Example:**
```typescript
await db.transaction(() => {
  db.run('INSERT INTO orders (user_id, total) VALUES (?, ?)', [userId, 100])
  db.run('UPDATE inventory SET quantity = quantity - 1 WHERE id = ?', [productId])
})
```

### `db.migrate(migrations)`

Run pending migrations.

**Returns:** `Promise<number[]>` - Array of applied migration versions

**Example:**
```typescript
const migrations = [
  {
    version: 1,
    up: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
    down: 'DROP TABLE users'
  },
  {
    version: 2,
    up: 'ALTER TABLE users ADD COLUMN email TEXT',
    down: '-- Not easily reversible in SQLite'
  }
]

await db.migrate(migrations)
```

### `db.export()`

Export database as Uint8Array (for saving to file).

**Returns:** `Uint8Array`

**Example:**
```typescript
const data = db.export()
// Save to file, send to server, etc.
```

### `db.import(data)`

Replace database contents from Uint8Array.

**Example:**
```typescript
const data = await fetch('/backup.db').then(r => r.arrayBuffer())
db.import(new Uint8Array(data))
```

### `db.save()`

Manually trigger save to persistent storage (if configured).

**Returns:** `Promise<void>`

### `db.load()`

Reload database from persistent storage, discarding in-memory changes.

**Returns:** `Promise<void>`

### `db.table<T>(tableName, options?)`

Get a table helper for convenient CRUD operations.

**Returns:** `TableHelper<T>`

**Example:**
```typescript
const users = db.table<User>('users')

// Insert
const id = users.insert({ name: 'Alice', email: 'alice@example.com' })

// Find by ID
const user = users.find(id)

// Find with conditions
const admins = users.where({ role: 'admin' })

// Update
users.update(id, { name: 'Alicia' })

// Delete
users.delete(id)

// Count
const count = users.count({ role: 'admin' })
```

### `db.prepare<T>(sql)`

Create a prepared statement for repeated execution.

**Returns:** `PreparedStatement<T>`

**Example:**
```typescript
const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)')
stmt.run(['Alice', 'alice@example.com'])
stmt.run(['Bob', 'bob@example.com'])
stmt.finalize()
```

### `db.insertMany(tableName, rows)`

Insert multiple rows in a single transaction.

**Returns:** `number[]` - Array of inserted row IDs

**Example:**
```typescript
const ids = db.insertMany('users', [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' }
])
```

### `db.close()`

Close the database connection and release resources.

### `db.clone()`

Create an independent copy of the database.

**Returns:** `Promise<Database>`

### `db.clear()`

Delete all data from all tables (preserves schema).

### `db.destroy()`

Close database and remove from persistent storage.

**Returns:** `Promise<void>`

## Persistence

### IndexedDB (Recommended)

```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})
```

- Larger storage limits (typically gigabytes)
- Async, non-blocking
- Better browser support for persistence

### localStorage

```typescript
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'localstorage' }
})
```

- Simpler but limited to 5-10MB
- Synchronous (blocks main thread)
- Base64 encoded (33% size overhead)

### Custom Storage Adapter

```typescript
const customStorage = {
  getItem: async (key) => { /* ... */ },
  setItem: async (key, value) => { /* ... */ },
  removeItem: async (key) => { /* ... */ }
}

const db = await createDatabase({
  persist: { key: 'my-app', storage: customStorage }
})
```

## Error Handling

```typescript
import { SqlError, SqlSyntaxError, SqlConstraintError, SqlNotFoundError } from '@motioneffector/sql'

try {
  db.run('INSERT INTO users (id, email) VALUES (?, ?)', [1, 'test@example.com'])
} catch (e) {
  if (e instanceof SqlConstraintError) {
    console.error('Constraint violation:', e.message)
  } else if (e instanceof SqlSyntaxError) {
    console.error('SQL syntax error:', e.message)
  } else if (e instanceof SqlNotFoundError) {
    console.error('Table or column not found:', e.message)
  } else if (e instanceof SqlError) {
    console.error('SQL error:', e.message, e.code)
  }
}
```

## Use Cases

- Offline-first web applications
- Browser-based tools with structured data
- Local-first apps with optional sync
- Prototyping with a real database
- Any application needing SQL in the browser

## Browser Support

Works in all modern browsers that support WebAssembly and ES2022. For older browsers, use a transpiler.

## License

MIT © [motioneffector](https://github.com/motioneffector)
