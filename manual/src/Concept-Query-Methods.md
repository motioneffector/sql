# Query Methods

The Database object provides four methods for executing SQL, each designed for a specific use case. Understanding which to use and when is fundamental to working with this library.

## How It Works

All query methods accept SQL strings and optional parameters. Parameters are bound safely to prevent SQL injection. The methods differ in what they return:

| Method | Use Case | Returns |
|--------|----------|---------|
| `exec(sql)` | DDL, multi-statement scripts | nothing |
| `run(sql, params)` | INSERT, UPDATE, DELETE | `{ changes, lastInsertRowId }` |
| `get(sql, params)` | SELECT single row | row object or `undefined` |
| `all(sql, params)` | SELECT multiple rows | array of row objects |

## Basic Usage

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase()

// exec - schema changes and scripts
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')

// run - mutations
const result = db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
console.log(result.lastInsertRowId) // 1

// get - single row
const user = db.get<{ id: number; name: string }>('SELECT * FROM users WHERE id = ?', [1])

// all - multiple rows
const users = db.all<{ id: number; name: string }>('SELECT * FROM users')
```

## Key Points

- **Use `exec()` for DDL** - CREATE, ALTER, DROP, and multi-statement scripts
- **Use `run()` for mutations** - INSERT, UPDATE, DELETE when you need change counts
- **Use `get()` for single rows** - Returns `undefined` if no match
- **Use `all()` for multiple rows** - Returns empty array if no matches
- **Always parameterize user input** - Never concatenate user data into SQL strings

## Examples

### Parameterized Queries

Use `?` for positional parameters or `:name` for named parameters:

```typescript
// Positional parameters (array)
db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])

// Named parameters (object)
db.run('INSERT INTO users (name, email) VALUES (:name, :email)', {
  name: 'Alice',
  email: 'alice@example.com'
})
```

### Type-Safe Queries

Provide a type parameter to `get()` and `all()` for TypeScript inference:

```typescript
interface User {
  id: number
  name: string
  email: string | null
}

const user = db.get<User>('SELECT * FROM users WHERE id = ?', [1])
// user is User | undefined

const users = db.all<User>('SELECT * FROM users WHERE name LIKE ?', ['A%'])
// users is User[]
```

### Tagged Template Queries

Use `db.sql` for a cleaner syntax with template literals:

```typescript
const name = 'Alice'
const email = 'alice@example.com'

const result = db.run(db.sql`
  INSERT INTO users (name, email)
  VALUES (${name}, ${email})
`)
```

Values are automatically parameterized.

## Related

- **[Your First Database](Your-First-Database)** - See these methods in action
- **[Using Table Helpers](Guide-Using-Table-Helpers)** - Higher-level CRUD without writing SQL
- **[Query Methods API](API-Query-Methods)** - Complete method signatures and options
