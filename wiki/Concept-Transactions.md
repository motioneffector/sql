# Transactions

Transactions ensure that multiple database operations either all succeed or all fail together. This is essential for maintaining data consistency when you need to perform related changes that shouldn't be partially applied.

## How It Works

Wrap your operations in `db.transaction()` to execute them atomically:

```
db.transaction(() => {
  operation1()  ─┐
  operation2()   ├─ All succeed → COMMIT
  operation3()  ─┘

  throw error   ─── Any fails → ROLLBACK all
})
```

The library handles BEGIN, COMMIT, and ROLLBACK automatically. If your callback throws an error (or returns a rejected promise), all changes are rolled back and the error is re-thrown.

Nested transactions use SQLite savepoints. If an inner transaction fails, only its changes are rolled back—the outer transaction can continue.

## Basic Usage

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase()

// Atomic operation
await db.transaction(() => {
  db.run('INSERT INTO orders (user_id, total) VALUES (?, ?)', [1, 99.99])
  db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [99.99, 1])
})
// Both succeed or neither does
```

## Key Points

- **Automatic rollback** - Any thrown error triggers a complete rollback
- **Re-throws errors** - The original error propagates after rollback
- **Supports async** - Callback can be sync or async
- **Nested savepoints** - Inner `transaction()` calls use savepoints, not new transactions
- **Concurrent queueing** - Multiple concurrent `transaction()` calls are serialized automatically

## Examples

### Error Handling

Catch errors after the transaction to handle failures:

```typescript
try {
  await db.transaction(() => {
    db.run('INSERT INTO orders (user_id, total) VALUES (?, ?)', [1, 100])
    db.run('UPDATE users SET balance = balance - 100 WHERE id = 999') // User doesn't exist

    const user = db.get('SELECT balance FROM users WHERE id = 999')
    if (!user) throw new Error('User not found')
  })
} catch (error) {
  console.log('Order failed:', error.message)
  // The INSERT was rolled back
}
```

### Async Transactions

Await async operations inside the callback:

```typescript
await db.transaction(async () => {
  db.run('INSERT INTO events (type) VALUES (?)', ['order_created'])

  await sendNotification() // Async operation

  db.run('UPDATE events SET notified = 1 WHERE id = last_insert_rowid()')
})
```

### Nested Transactions

Inner failures don't abort the outer transaction if caught:

```typescript
await db.transaction(async () => {
  db.run('INSERT INTO logs (message) VALUES (?)', ['Starting batch'])

  try {
    await db.transaction(() => {
      db.run('INSERT INTO items (name) VALUES (?)', ['Widget'])
      throw new Error('Widget error')
    })
  } catch {
    // Inner transaction rolled back, but we continue
    db.run('INSERT INTO logs (message) VALUES (?)', ['Widget failed, continuing'])
  }

  db.run('INSERT INTO items (name) VALUES (?)', ['Gadget'])
  db.run('INSERT INTO logs (message) VALUES (?)', ['Batch complete'])
})
// logs has 3 entries, items has 1 (Gadget only)
```

### Checking Transaction State

Use `db.inTransaction` to check if you're currently in a transaction:

```typescript
function saveUser(db: Database, user: User) {
  if (!db.inTransaction) {
    console.warn('saveUser called outside transaction')
  }
  db.run('INSERT INTO users (name) VALUES (?)', [user.name])
}
```

## Related

- **[Working with Transactions](Guide-Working-With-Transactions)** - Detailed guide with patterns
- **[Transactions API](API-Transactions)** - Method signatures and options
- **[Schema Migrations](Guide-Schema-Migrations)** - Migrations use transactions internally
