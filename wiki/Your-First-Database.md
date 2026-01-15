# Your First Database

Create a working in-browser SQLite database in about 5 minutes.

By the end of this guide, you'll have a database with a users table, inserted data, and queried results.

## What We're Building

A simple user database that demonstrates the core workflow: create a database, define a schema, insert rows, and query them back. The final output will look like:

```
{ id: 1, name: 'Alice', email: 'alice@example.com' }
```

## Step 1: Import and Create the Database

The library exports a single factory function. It's async because it needs to load the SQL.js WebAssembly binary.

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase()
```

This creates an empty in-memory database. We'll add persistence later.

## Step 2: Create a Table

Use `exec()` for DDL statements like CREATE TABLE. This method executes raw SQL without parameters.

```typescript
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`)
```

The table now exists in memory.

## Step 3: Insert Data

Use `run()` for INSERT, UPDATE, and DELETE. The second argument is an array of values that replace the `?` placeholders.

```typescript
const result = db.run(
  'INSERT INTO users (name, email) VALUES (?, ?)',
  ['Alice', 'alice@example.com']
)

console.log(result.lastInsertRowId) // 1
console.log(result.changes)         // 1
```

Always use parameterized queries for user input to prevent SQL injection.

## Step 4: Query Data

Use `get()` to fetch a single row, or `all()` to fetch multiple rows. Both accept a type parameter for TypeScript.

```typescript
// Single row
const user = db.get<{ id: number; name: string; email: string }>(
  'SELECT * FROM users WHERE id = ?',
  [1]
)
console.log(user) // { id: 1, name: 'Alice', email: 'alice@example.com' }

// Multiple rows
const users = db.all<{ id: number; name: string; email: string }>(
  'SELECT * FROM users'
)
console.log(users.length) // 1
```

## Step 5: Close the Database

When you're done, close the database to free resources.

```typescript
db.close()
```

## The Complete Code

Here's everything together:

```typescript
import { createDatabase } from '@motioneffector/sql'

async function main() {
  // Create database
  const db = await createDatabase()

  // Create table
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE
    )
  `)

  // Insert data
  db.run(
    'INSERT INTO users (name, email) VALUES (?, ?)',
    ['Alice', 'alice@example.com']
  )

  // Query data
  const user = db.get<{ id: number; name: string; email: string }>(
    'SELECT * FROM users WHERE id = ?',
    [1]
  )
  console.log(user)

  // Clean up
  db.close()
}

main()
```

## What's Next?

Now that you have the basics:

- **[Understand Query Methods](Concept-Query-Methods)** - Learn the differences between `exec`, `run`, `get`, and `all`
- **[Set Up Persistence](Guide-Setting-Up-Persistence)** - Keep your data between page reloads
- **[Use Table Helpers](Guide-Using-Table-Helpers)** - Simplified CRUD without writing SQL
- **[Explore the API](API-CreateDatabase)** - Full reference when you need details
