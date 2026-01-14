# Prepared Statements

Prepared statements parse SQL once and execute many times with different parameters. Use them when you need to run the same query repeatedly for better performance.

## Prerequisites

Before starting, you should:

- [Understand query methods](Concept-Query-Methods)

## Overview

We'll use prepared statements by:

1. Understanding when they help
2. Creating and using statements
3. Cleaning up properly
4. Optimizing batch operations

## Step 1: Know When to Use Prepared Statements

Prepared statements help when:
- Running the same query many times (batch inserts, repeated lookups)
- Performance is critical (tight loops, real-time operations)
- You want to separate SQL parsing from execution

Don't bother with prepared statements for:
- One-off queries
- Queries that run occasionally
- Simple CRUD (use table helpers instead)

## Step 2: Create and Use a Statement

Call `db.prepare()` with your SQL, then execute with `run()`, `get()`, or `all()`:

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase()
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, score INTEGER)')

// Prepare once
const stmt = db.prepare<{ id: number; name: string; score: number }>(
  'SELECT * FROM users WHERE score > ?'
)

// Execute many times
const highScorers = stmt.all([100])
const eliteScorers = stmt.all([500])

// Always finalize when done
stmt.finalize()
```

## Step 3: Clean Up Properly

Always call `finalize()` when you're done with a statement. This releases memory:

```typescript
const stmt = db.prepare('INSERT INTO logs (message) VALUES (?)')

try {
  for (const message of messages) {
    stmt.run([message])
  }
} finally {
  stmt.finalize()
}
```

After `finalize()`, the statement can't be used. Calling methods throws an error.

## Step 4: Optimize Batch Operations

Prepared statements shine for bulk inserts:

```typescript
const db = await createDatabase()
db.exec('CREATE TABLE events (id INTEGER PRIMARY KEY, type TEXT, timestamp TEXT)')

const events = generateEvents(10000) // Array of 10,000 events

// Fast: Prepare once, execute many
console.time('prepared')
const stmt = db.prepare('INSERT INTO events (type, timestamp) VALUES (?, ?)')
for (const event of events) {
  stmt.run([event.type, event.timestamp])
}
stmt.finalize()
console.timeEnd('prepared') // ~100ms

// Slower: Parse SQL each time
console.time('unprepared')
for (const event of events) {
  db.run('INSERT INTO events (type, timestamp) VALUES (?, ?)', [event.type, event.timestamp])
}
console.timeEnd('unprepared') // ~200ms
```

## Complete Example

Batch insert with transaction and prepared statement:

```typescript
import { createDatabase } from '@motioneffector/sql'

interface Product {
  sku: string
  name: string
  price: number
}

async function importProducts(db: Database, products: Product[]): Promise<number> {
  let imported = 0

  await db.transaction(() => {
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO products (sku, name, price) VALUES (?, ?, ?)'
    )

    try {
      for (const product of products) {
        const result = stmt.run([product.sku, product.name, product.price])
        imported += result.changes
      }
    } finally {
      stmt.finalize()
    }
  })

  return imported
}

// Usage
const db = await createDatabase()
db.exec('CREATE TABLE products (sku TEXT PRIMARY KEY, name TEXT, price REAL)')

const count = await importProducts(db, [
  { sku: 'WIDGET-001', name: 'Widget', price: 29.99 },
  { sku: 'GADGET-001', name: 'Gadget', price: 49.99 },
  // ... thousands more
])

console.log(`Imported ${count} products`)
```

## Variations

### Query with Different Parameters

Rebind parameters for each execution:

```typescript
const stmt = db.prepare<{ id: number; name: string }>(
  'SELECT * FROM users WHERE id = ?'
)

const user1 = stmt.get([1])
const user2 = stmt.get([2])
const user3 = stmt.get([3])

stmt.finalize()
```

### Named Parameters

Use named parameters for clarity:

```typescript
const stmt = db.prepare(
  'INSERT INTO users (name, email, role) VALUES (:name, :email, :role)'
)

stmt.run({ name: 'Alice', email: 'alice@example.com', role: 'admin' })
stmt.run({ name: 'Bob', email: 'bob@example.com', role: 'user' })

stmt.finalize()
```

### Multiple Statements for Different Operations

Prepare several statements upfront:

```typescript
const insertUser = db.prepare('INSERT INTO users (name) VALUES (?)')
const updateScore = db.prepare('UPDATE users SET score = score + ? WHERE id = ?')
const findByName = db.prepare<{ id: number }>('SELECT id FROM users WHERE name = ?')

try {
  // Use them as needed
  insertUser.run(['Alice'])
  const alice = findByName.get(['Alice'])
  if (alice) {
    updateScore.run([100, alice.id])
  }
} finally {
  insertUser.finalize()
  updateScore.finalize()
  findByName.finalize()
}
```

### Using insertMany for Bulk Inserts

For the common case of inserting many rows, use `db.insertMany()` instead:

```typescript
// Simpler alternative to prepared statements for bulk inserts
const ids = db.insertMany('users', [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Charlie', email: 'charlie@example.com' }
])
```

This uses prepared statements and transactions internally.

## Troubleshooting

### Statement has been finalized

**Symptom:** `Error: Statement has been finalized`

**Cause:** Calling methods on a statement after `finalize()`.

**Solution:** Keep track of statement lifecycle. Create a new statement if needed.

### Memory Leak Warning

**Symptom:** Memory usage grows over time.

**Cause:** Creating statements without finalizing them.

**Solution:** Always call `finalize()` in a `finally` block or use try/finally pattern.

### No Performance Improvement

**Symptom:** Prepared statements aren't faster than regular queries.

**Cause:** Not enough iterations to offset setup cost, or SQL is trivial.

**Solution:** Prepared statements help most with 100+ executions. For small batches, the overhead isn't worth it.

## See Also

- **[Query Methods](Concept-Query-Methods)** - Regular query methods
- **[Prepared Statements API](API-Prepared-Statements)** - Method reference
- **[Batch Operations](API-Batch-Operations)** - insertMany for bulk inserts
