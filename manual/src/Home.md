# @motioneffector/sql

SQLite in your browser. This library wraps SQL.js to give you a real relational database running entirely client-side via WebAssembly. No server needed, no new query language to learn. If you know SQL, you already know how to use this. Full ACID transactions, schema migrations, and automatic persistence to browser storage.

## I want to...

| Goal | Where to go |
|------|-------------|
| Get up and running quickly | [Your First Database](Your-First-Database) |
| Understand how persistence works | [Persistence](Concept-Persistence) |
| Set up database migrations | [Schema Migrations](Guide-Schema-Migrations) |
| Perform CRUD operations easily | [Using Table Helpers](Guide-Using-Table-Helpers) |
| Handle concurrent operations | [Transactions](Concept-Transactions) |
| Export/backup my database | [Export and Import](Guide-Export-And-Import) |
| Look up a specific method | [API Reference](API-CreateDatabase) |

## Key Concepts

### Database

The `Database` object is your interface to SQLite. Create one with `createDatabase()`, then use its methods to execute SQL. The database lives in memory but can automatically persist to IndexedDB or localStorage.

### Query Methods

Four methods cover all your data access needs: `exec()` for DDL and multi-statement scripts, `run()` for mutations that return change counts, `get()` for fetching a single row, and `all()` for fetching multiple rows. All support parameterized queries for security.

### Persistence

Configure `persist: { key, storage }` when creating the database to automatically save changes to browser storage. Auto-save is debounced to batch rapid changes. You can also manually control when to save or reload.

## Quick Example

```typescript
import { createDatabase } from '@motioneffector/sql'

// Create a persistent database
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

// Insert data
db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])

// Query data
const user = db.get<{ id: number; name: string; email: string }>(
  'SELECT * FROM users WHERE id = ?',
  [1]
)

console.log(user) // { id: 1, name: 'Alice', email: 'alice@example.com' }
```

---

**[Full API Reference →](API-CreateDatabase)**
