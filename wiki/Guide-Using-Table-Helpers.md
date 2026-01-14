# Using Table Helpers

Table helpers provide a simplified API for common CRUD operations. Instead of writing SQL, call methods like `insert()`, `find()`, and `update()`. The helper generates safe, parameterized queries for you.

## Prerequisites

Before starting, you should:

- [Create a database](Your-First-Database)
- Have an existing table to work with

## Overview

We'll use table helpers by:

1. Creating a helper for a table
2. Inserting rows
3. Finding and querying rows
4. Updating and deleting rows
5. Counting rows

## Step 1: Create a Table Helper

Call `db.table<T>()` with your table name and an optional type parameter:

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase()

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    active INTEGER DEFAULT 1
  )
`)

interface User {
  id: number
  name: string
  email: string | null
  active: number
}

const users = db.table<User>('users')
```

The helper is tied to that table. Create multiple helpers for multiple tables.

## Step 2: Insert Rows

Use `insert()` to add a row. It returns the new row's ID:

```typescript
const id = users.insert({
  name: 'Alice',
  email: 'alice@example.com'
})

console.log(`Created user ${id}`) // Created user 1
```

Omit columns with defaults (like `id` and `active`). Pass `null` to explicitly set NULL.

## Step 3: Find and Query Rows

Find a single row by its primary key:

```typescript
const alice = users.find(1)
console.log(alice) // { id: 1, name: 'Alice', email: 'alice@example.com', active: 1 }

const notFound = users.find(999)
console.log(notFound) // undefined
```

Query multiple rows with conditions:

```typescript
// Find all active users
const activeUsers = users.where({ active: 1 })

// Find by email
const byEmail = users.where({ email: 'alice@example.com' })

// Multiple conditions (AND logic)
const filtered = users.where({ active: 1, name: 'Alice' })

// Get all rows
const everyone = users.all()
```

## Step 4: Update and Delete Rows

Update by primary key:

```typescript
const changed = users.update(1, { name: 'Alicia' })
console.log(`Updated ${changed} rows`) // Updated 1 rows
```

Delete by primary key:

```typescript
const deleted = users.delete(1)
console.log(`Deleted ${deleted} rows`) // Deleted 1 rows
```

## Step 5: Count Rows

Count all or matching rows:

```typescript
const total = users.count()
console.log(`${total} users total`)

const active = users.count({ active: 1 })
console.log(`${active} active users`)
```

## Complete Example

A typical user management flow:

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase()

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    role TEXT DEFAULT 'user',
    created_at TEXT
  )
`)

interface User {
  id: number
  name: string
  email: string
  role: string
  created_at: string
}

const users = db.table<User>('users')

// Create users
users.insert({ name: 'Alice', email: 'alice@example.com', created_at: new Date().toISOString() })
users.insert({ name: 'Bob', email: 'bob@example.com', role: 'admin', created_at: new Date().toISOString() })
users.insert({ name: 'Charlie', email: 'charlie@example.com', created_at: new Date().toISOString() })

// Query
const admins = users.where({ role: 'admin' })
console.log(`${admins.length} admins`) // 1 admins

// Update
users.update(1, { role: 'moderator' })

// Find
const alice = users.find(1)
console.log(alice?.role) // moderator

// Delete
users.delete(3)
console.log(users.count()) // 2
```

## Variations

### Custom Primary Key

If your table uses a different column as the primary key:

```typescript
db.exec('CREATE TABLE products (sku TEXT PRIMARY KEY, name TEXT, price REAL)')

const products = db.table('products', { primaryKey: 'sku' })

products.insert({ sku: 'WIDGET-001', name: 'Widget', price: 29.99 })

const widget = products.find('WIDGET-001')
```

### Finding by Non-Primary Key

Override the key for a single operation:

```typescript
const users = db.table<User>('users')

// Find by email instead of id
const user = users.find('alice@example.com', { key: 'email' })

// Update by email
users.update('alice@example.com', { name: 'Alicia' }, { key: 'email' })

// Delete by email
users.delete('alice@example.com', { key: 'email' })
```

### Batch Inserts

Insert many rows efficiently with `db.insertMany()`:

```typescript
const ids = db.insertMany('users', [
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' },
  { name: 'User 3', email: 'user3@example.com' }
])

console.log(`Inserted ${ids.length} users`) // Inserted 3 users
```

### Combining with Raw SQL

Use helpers for simple CRUD and raw SQL for complex queries:

```typescript
const users = db.table<User>('users')

// Simple operations with helper
users.insert({ name: 'Alice', email: 'alice@example.com' })

// Complex query with raw SQL
const result = db.all<{ name: string; post_count: number }>(`
  SELECT u.name, COUNT(p.id) as post_count
  FROM users u
  LEFT JOIN posts p ON p.user_id = u.id
  GROUP BY u.id
  ORDER BY post_count DESC
`)
```

## Troubleshooting

### SqlNotFoundError on Insert

**Symptom:** `SqlNotFoundError: no such table: tablename`

**Cause:** Table doesn't exist or name is misspelled.

**Solution:** Run migrations first, check table name spelling.

### SqlConstraintError on Insert

**Symptom:** `SqlConstraintError: UNIQUE constraint failed`

**Cause:** Duplicate value in a UNIQUE column.

**Solution:** Check for existing rows or use a different value.

### Type Mismatch in Results

**Symptom:** TypeScript type doesn't match actual data.

**Cause:** Type parameter doesn't match table schema.

**Solution:** Update your interface to match the actual columns and types.

## See Also

- **[Query Methods](Concept-Query-Methods)** - When you need raw SQL instead
- **[Table Helper API](API-Table-Helper)** - Complete method reference
- **[Batch Operations API](API-Batch-Operations)** - insertMany details
