# @motioneffector/sql

A lightweight TypeScript wrapper for SQL.js with migrations, persistence, and full type safety.

[![npm version](https://img.shields.io/npm/v/@motioneffector/sql.svg)](https://www.npmjs.com/package/@motioneffector/sql)
[![license](https://img.shields.io/npm/l/@motioneffector/sql.svg)](https://github.com/motioneffector/sql/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)


## Features

- **Browser SQLite** - Full SQLite database in the browser via WebAssembly
- **Schema Migrations** - Versioned migrations with automatic tracking
- **Type-Safe Queries** - Generic query methods with TypeScript inference
- **Auto-Persistence** - Automatic saves to IndexedDB or localStorage
- **Transaction Queue** - Concurrent transactions without savepoint conflicts
- **ACID Guarantees** - Full transaction support with automatic rollback
- **Import/Export** - Save and load database files
- **Table Helpers** - Convenient CRUD operations for common patterns

[Read the full manual →](https://motioneffector.github.io/sql/manual/)

## Quick Start

```typescript
import { createDatabase } from '@motioneffector/sql'

// Create a database with auto-persistence
const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})

// Create a table
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`)

// Insert and query data
db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])

const user = db.get<{ id: number; name: string; email: string }>(
  'SELECT * FROM users WHERE id = ?',
  [1]
)
```

## Testing & Validation

- **Comprehensive test suite** - 554 unit tests covering core functionality
- **Fuzz tested** - Randomized input testing to catch edge cases
- **Strict TypeScript** - Full type coverage with no `any` types
- **Minimal dependencies** - Only sql.js as peer dependency

## License

MIT © [motioneffector](https://github.com/motioneffector)
